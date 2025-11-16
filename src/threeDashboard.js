import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationId = null;
let containerEl = null;
let panelEl = null;
let currentModel = null;
let dropOverlay = null;
let defaultFloorplanBase = '11_15_2025.Floorplan'; // can be overridden via setFloorplanBaseName
let floorplanViewer = null;
let bottomDockEl = null;
let charts = { usage: null, openings: null };
let echartsLib = null;
let lastReport = null;

function createRenderer(target) {
	const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	r.setSize(target.clientWidth, target.clientHeight);
	r.outputColorSpace = THREE.SRGBColorSpace;
	target.appendChild(r.domElement);
	return r;
}

function addDefaultLighting(targetScene) {
	const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
	hemi.position.set(0, 1, 0);
	targetScene.add(hemi);

	const dir = new THREE.DirectionalLight(0xffffff, 0.8);
	dir.position.set(5, 10, 7.5);
	dir.castShadow = false;
	targetScene.add(dir);
}

function fitCameraToObject(object, fitOffset = 1.2) {
	const box = new THREE.Box3().setFromObject(object);
	const size = box.getSize(new THREE.Vector3());
	const center = box.getCenter(new THREE.Vector3());

	const maxDim = Math.max(size.x, size.y, size.z);
	const fov = THREE.MathUtils.degToRad(camera.fov);
	const distance = (maxDim / 2) / Math.tan(fov / 2);

	const dir = new THREE.Vector3(0, 0, 1);
	camera.position.copy(center.clone().add(dir.multiplyScalar(distance * fitOffset)));
	camera.near = distance / 100;
	camera.far = distance * 100;
	camera.updateProjectionMatrix();

	controls.target.copy(center);
	controls.update();
}

function animate() {
	animationId = requestAnimationFrame(animate);
	controls.update();
	renderer.render(scene, camera);
}

function onResize() {
	if (!containerEl || !renderer || !camera) return;
	const w = containerEl.clientWidth;
	const h = containerEl.clientHeight;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
	renderer.setSize(w, h);
}

function createDropOverlay(target) {
	const overlay = document.createElement('div');
	overlay.className = 'dashboard-drop';
	overlay.innerHTML = `
		<div class="dashboard-drop-content">
			<div class="icon">⬆</div>
			<h2>Drop GLB/GLTF here</h2>
			<p>or drag onto the 3D area</p>
		</div>
	`;
	target.appendChild(overlay);
	return overlay;
}

function setupDragAndDrop(target) {
	if (!dropOverlay) dropOverlay = createDropOverlay(target);

	const show = () => dropOverlay.classList.add('active');
	const hide = () => dropOverlay.classList.remove('active');

	const onDragOver = (e) => {
		e.preventDefault();
		show();
	};
	const onDragEnter = (e) => {
		e.preventDefault();
		show();
	};
	const onDragLeave = (e) => {
		if (e.target === target || e.target === dropOverlay) {
			hide();
		}
	};
	const onDrop = async (e) => {
		e.preventDefault();
		hide();
		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;
		const file = files[0];
		const name = (file.name || '').toLowerCase();
		if (name.endsWith('.glb') || name.endsWith('.gltf')) {
			try {
				await loadGLBFile(file);
			} catch (err) {
				console.error('Failed to load dropped file:', err);
				alert('Failed to load GLB/GLTF file. See console for details.');
			}
		} else {
			alert('Please drop a .glb or .gltf file on the 3D dashboard.');
		}
	};

	// Attach to the container so it doesn't interfere with other UI
	target.addEventListener('dragenter', onDragEnter);
	target.addEventListener('dragover', onDragOver);
	target.addEventListener('dragleave', onDragLeave);
	target.addEventListener('drop', onDrop);
}

function setText(id, value) {
	if (!panelEl) return;
	const el = panelEl.querySelector(id);
	if (el) el.textContent = value != null ? String(value) : '—';
}

function setFurniture(rows) {
	if (!panelEl) return;
	const tbody = panelEl.querySelector('#furniture-table tbody');
	if (!tbody) return;
	tbody.innerHTML = '';
	if (Array.isArray(rows) && rows.length > 0) {
		rows.forEach(r => {
			const tr = document.createElement('tr');
			tr.innerHTML = `<td>${r.type ?? '—'}</td><td>${r.count ?? '—'}</td><td>${r.notes ?? '—'}</td>`;
			tbody.appendChild(tr);
		});
	} else {
		const tr = document.createElement('tr');
		tr.innerHTML = '<td>—</td><td>—</td><td>—</td>';
		tbody.appendChild(tr);
	}
}

function setFloorPlan(url) {
	// When details card is removed, we still keep a floorplan card in the dock
	const containerInDock = document.getElementById('floorplan-box');
	if (containerInDock) {
		if (!floorplanViewer) {
			floorplanViewer = initFloorplanViewer(containerInDock);
		}
		floorplanViewer.setSource(url);
	}
}

// --------- Floorplan Image Viewer (zoom/pan/fullscreen) ----------
function initFloorplanViewer(container) {
	// Structure
	container.innerHTML = `
		<div class="fp-viewer">
			<div class="fp-toolbar">
				<button class="fp-btn" data-action="zoom-in" title="Zoom in">＋</button>
				<button class="fp-btn" data-action="zoom-out" title="Zoom out">－</button>
				<button class="fp-btn" data-action="reset" title="Reset">⟳</button>
				<button class="fp-btn" data-action="fullscreen" title="Fullscreen">⛶</button>
			</div>
			<div class="fp-stage">
				<img class="fp-image" alt="Floor plan" />
			</div>
		</div>
	`;
	const root = container.querySelector('.fp-viewer');
	const stage = root.querySelector('.fp-stage');
	const img = root.querySelector('.fp-image');
	const toolbar = root.querySelector('.fp-toolbar');
	let scale = 1;
	let pos = { x: 0, y: 0 };
	let isPanning = false;
	let panStart = { x: 0, y: 0 };
	let posStart = { x: 0, y: 0 };

	function applyTransform() {
		img.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale})`;
	}

	function zoomAt(delta, centerX, centerY) {
		const prevScale = scale;
		scale = Math.max(0.25, Math.min(5, scale * (delta > 0 ? 1.1 : 0.9)));
		// keep pointer position stable
		const rect = stage.getBoundingClientRect();
		const cx = (centerX ?? (rect.left + rect.width / 2)) - rect.left;
		const cy = (centerY ?? (rect.top + rect.height / 2)) - rect.top;
		pos.x = cx - ((cx - pos.x) * (scale / prevScale));
		pos.y = cy - ((cy - pos.y) * (scale / prevScale));
		applyTransform();
	}

	// Mouse wheel zoom
	stage.addEventListener('wheel', (e) => {
		e.preventDefault();
		zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
	}, { passive: false });

	// Pan with mouse drag
	stage.addEventListener('mousedown', (e) => {
		isPanning = true;
		panStart = { x: e.clientX, y: e.clientY };
		posStart = { ...pos };
	});
	window.addEventListener('mousemove', (e) => {
		if (!isPanning) return;
		pos.x = posStart.x + (e.clientX - panStart.x);
		pos.y = posStart.y + (e.clientY - panStart.y);
		applyTransform();
	});
	window.addEventListener('mouseup', () => { isPanning = false; });

	// Toolbar actions
	toolbar.addEventListener('click', (e) => {
		const btn = e.target.closest('.fp-btn');
		if (!btn) return;
		const action = btn.getAttribute('data-action');
		if (action === 'zoom-in') zoomAt(1);
		if (action === 'zoom-out') zoomAt(-1);
		if (action === 'reset') {
			scale = 1; pos = { x: 0, y: 0 }; applyTransform();
		}
		if (action === 'fullscreen') {
			if (!document.fullscreenElement) {
				root.requestFullscreen?.();
			} else {
				document.exitFullscreen?.();
			}
		}
	});

	function setSource(src) {
		if (!src) {
			img.removeAttribute('src');
			container.innerHTML = '<span>Floor plan preview</span>';
			return;
		}
		img.src = src;
		scale = 1;
		pos = { x: 0, y: 0 };
		applyTransform();
	}

	return { setSource };
}

async function tryLoadFloorplanAssets() {
	const infoUrl = `/model_info.json`;
	const jsonUrl = `/${defaultFloorplanBase}.json`;
	const pngUrl = `/floorplan.png`;
	const pdfUrl = `/${defaultFloorplanBase}.pdf`;

	const [infoRes, jsonRes, pngHead, pdfHead] = await Promise.allSettled([
		fetch(infoUrl, { cache: 'no-store' }),
		fetch(jsonUrl, { cache: 'no-store' }),
		fetch(pngUrl, { method: 'HEAD', cache: 'no-store' }),
		fetch(pdfUrl, { method: 'HEAD', cache: 'no-store' }),
	]);

	// model_info.json
	let imageSet = false;
	if (infoRes.status === 'fulfilled' && infoRes.value.ok) {
		try {
			const report = await infoRes.value.json();
			applyFloorplanReport(report);
			if (report.floorplanImage) { setFloorPlan(report.floorplanImage); imageSet = true; }
			if (report.overview) {
				updateUsageChart({ usedArea: report.overview.usedArea, unusedArea: report.overview.unusedArea });
				updateOpeningsChart({ wallArea: report.overview.totalWallArea, windowArea: report.overview.totalWindowArea });
			}
		} catch (_) {}
	}
	// fallback JSON report
	if (jsonRes.status === 'fulfilled' && jsonRes.value.ok) {
		try {
			const report = await jsonRes.value.json();
			applyFloorplanReport(report);
		} catch (_) {}
	}
	// prefer explicit png if present
	if (!imageSet && pngHead.status === 'fulfilled' && pngHead.value.ok) {
		setFloorPlan(pngUrl); imageSet = true;
	}
	// PDF present → show no image but parse text
	if (!imageSet && pdfHead.status === 'fulfilled' && pdfHead.value.ok) {
		setFloorPlan(null);
		tryParseFloorplanPdf(pdfUrl);
	}
}

function applyFloorplanReport(report) {
	lastReport = report;
	// Top-level overview numbers
	if (report?.overview) {
		const o = report.overview;
		setText('#kpi-gross-area', o.totalExteriorFloorArea ?? o.total_exterior_floor_area);
		setText('#arch-livable-area', o.totalLivableFloorArea ?? o.total_livable_floor_area);
		setText('#arch-wall-area', o.totalWallArea ?? o.total_wall_area);
		setText('#arch-window-area', o.totalWindowArea ?? o.total_window_area);
		// used / unused can be derived if provided
		if (o.usedArea || o.unusedArea) {
			setText('#kpi-used-unused', `${o.usedArea ?? '—'} / ${o.unusedArea ?? '—'}`);
		}
		setText('#kpi-total-volume', o.totalVolume ?? o.total_volume ?? '—');
	}
	// Rooms: choose primary room (e.g., Living Room) for dimensions
	if (Array.isArray(report?.rooms) && report.rooms.length > 0) {
		const primary = report.rooms.find(r => /living/i.test(r.name)) || report.rooms[0];
		const dims = primary?.dimensions || primary?.boundingBox;
		// Only stored for modal; totals card shows building totals
	}
	// Furniture list if provided
	// (Used in modal rendering on demand)
}

// (PDF parsing removed)

export function initThreeDashboard(container) {
	if (scene) return;
	containerEl = container;

	scene = new THREE.Scene();
	scene.background = null;
	camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.01, 1000);
	camera.position.set(0, 1, 3);
	renderer = createRenderer(container);
	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.target.set(0, 0, 0);
	controls.update();
	addDefaultLighting(scene);
	// Removed grid helper for a cleaner GLB view

	// Side panel removed; details live in bottom dock
	// drag & drop for GLB
	setupDragAndDrop(container);
	// Create dock first so floorplan container exists
	createBottomDock();
	// Attempt to load default floorplan report and preview if present (after dock)
	tryLoadFloorplanAssets();

	window.addEventListener('resize', onResize);
	onResize();
	animate();
}

export async function loadGLBFile(file) {
	if (!scene) throw new Error('threeDashboard not initialized');
	if (currentModel) {
		scene.remove(currentModel);
		currentModel.traverse((child) => {
			if (child.isMesh) {
				child.geometry?.dispose?.();
				if (child.material) {
					if (Array.isArray(child.material)) {
						child.material.forEach(m => m.dispose?.());
					} else {
						child.material.dispose?.();
					}
				}
			}
		});
		currentModel = null;
	}
	const arrayBuffer = await file.arrayBuffer();
	const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
	const url = URL.createObjectURL(blob);
	try {
		const loader = new GLTFLoader();
		const gltf = await loader.loadAsync(url);
		currentModel = gltf.scene;
		scene.add(currentModel);
		fitCameraToObject(currentModel);

		// quick stats
		const box = new THREE.Box3().setFromObject(currentModel);
		const size = box.getSize(new THREE.Vector3());
		const extents = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
		let vertices = 0;
		let faces = 0;
		currentModel.traverse((o) => {
			if (o.isMesh && o.geometry) {
				const g = o.geometry.index ? o.geometry.index.count / 3 : (o.geometry.attributes?.position?.count ?? 0) / 3;
				if (o.geometry.attributes?.position) vertices += o.geometry.attributes.position.count;
				faces += Math.floor(g);
			}
		});
		setText('#kpi-vertices', vertices.toLocaleString());
		setText('#kpi-faces', faces.toLocaleString());
		setText('#kpi-extents', extents);
	} finally {
		URL.revokeObjectURL(url);
	}
}

// Public update APIs
export function updateSpaceMetrics({ grossArea, usedArea, unusedArea, roomDimensions }) {
	if (grossArea != null && usedArea != null && unusedArea != null) {
		setText('#kpi-gross-area', grossArea);
		setText('#kpi-used-unused', `${usedArea} / ${unusedArea}`);
	}
	if (roomDimensions) {
		setText('#dim-width', roomDimensions.width);
		setText('#dim-depth', roomDimensions.depth);
		setText('#dim-height', roomDimensions.height);
	}
}

export function updateArchitectural({ wallArea, windowArea, ceilingHeight, livableArea }) {
	setText('#arch-wall-area', wallArea);
	setText('#arch-window-area', windowArea);
	setText('#arch-ceiling-height', ceilingHeight);
	setText('#arch-livable-area', livableArea);
	updateOpeningsChart({ wallArea, windowArea });
}

export function updateFurniture(list) {
	setFurniture(list);
}

export function updateRoomsCount(count) {
	setText('#kpi-rooms', count);
}

export function updateFloorPlan(url) {
	setFloorPlan(url);
}

export function show() {
	if (containerEl) containerEl.style.display = 'block';
	if (bottomDockEl) bottomDockEl.style.display = 'grid';
	if (!animationId) animate();
}

export function hide() {
	if (containerEl) containerEl.style.display = 'none';
	if (animationId) {
		cancelAnimationFrame(animationId);
		animationId = null;
	}
}

export function dispose() {
	if (animationId) {
		cancelAnimationFrame(animationId);
		animationId = null;
	}
	window.removeEventListener('resize', onResize);
	if (renderer) {
		renderer.dispose();
	}
	if (scene) {
		scene.traverse(obj => {
			if (obj.isMesh) {
				obj.geometry?.dispose?.();
				if (obj.material) {
					if (Array.isArray(obj.material)) {
						obj.material.forEach(m => m.dispose?.());
					} else {
						obj.material.dispose?.();
					}
				}
			}
		});
	}
	if (containerEl && renderer) {
		try {
			containerEl.removeChild(renderer.domElement);
		} catch (_) {}
	}
	// Remove bottom dock so it doesn't appear in other tabs
	// Keep bottom dock persistent across tabs (do not remove)
	scene = null;
	camera = null;
	renderer = null;
	controls = null;
	containerEl = null;
	panelEl = null;
	toggleBtn = null;
	currentModel = null;
	// bottomDockEl persists
}


// =============== Bottom Dock + Charts (ECharts via CDN ESM) ===============
function createBottomDock() {
	if (bottomDockEl) return;
	bottomDockEl = document.createElement('div');
	bottomDockEl.className = 'dashboard-bottom';
	bottomDockEl.innerHTML = `
		<div class="chart-card card-square">
			<div class="chart-title">Used vs Unused</div>
			<div class="chart-canvas" id="chart-usage"></div>
		</div>
		<div class="chart-card card-square">
			<div class="chart-title">Openings</div>
			<div class="chart-canvas" id="chart-openings"></div>
		</div>
		<div class="chart-card card-totals" id="totals-card">
			<div class="chart-title">Building Totals</div>
			<div class="totals-wrap">
				<div class="totals-grid">
					<div class="kv"><div class="k">Exterior Floor Area</div><div class="v" id="kpi-gross-area">—</div></div>
					<div class="kv"><div class="k">Livable Floor Area</div><div class="v" id="arch-livable-area">—</div></div>
					<div class="kv"><div class="k">Wall Area</div><div class="v" id="arch-wall-area">—</div></div>
					<div class="kv"><div class="k">Window Area</div><div class="v" id="arch-window-area">—</div></div>
					<div class="kv"><div class="k">Total Volume</div><div class="v" id="kpi-total-volume">—</div></div>
				</div>
				<div class="totals-footer"><button id="view-more-details" class="view-btn">View details</button></div>
			</div>
		</div>
		<div class="chart-card card-square card-floorplan">
			<div class="chart-title">Floor Plan</div>
			<div class="chart-canvas" style="padding:6px">
				<div id="floorplan-box" style="width:100%;height:100%"></div>
			</div>
		</div>
	`;
	document.body.appendChild(bottomDockEl);
	// Point bindings to totals card so setText() fills values
	panelEl = document.getElementById('totals-card');
	initCharts();

	// Modal setup
	ensureDetailsModal();
	const viewBtn = document.getElementById('view-more-details');
	viewBtn?.addEventListener('click', () => {
		openDetailsModal();
	});
}

function ensureDetailsModal() {
	if (document.getElementById('details-modal')) return;
	const modal = document.createElement('div');
	modal.id = 'details-modal';
	modal.className = 'details-modal hidden';
	modal.innerHTML = `
		<div class="details-modal-content">
			<div class="details-modal-header">
				<h3>Detailed Room & Architectural Info</h3>
				<button class="close-btn" id="details-modal-close" title="Close">×</button>
			</div>
			<div class="details-modal-body" id="details-modal-body"></div>
		</div>
	`;
	document.body.appendChild(modal);
	modal.addEventListener('click', (e) => {
		if (e.target === modal) closeDetailsModal();
	});
	document.getElementById('details-modal-close')?.addEventListener('click', closeDetailsModal);
}

function openDetailsModal() {
	const modal = document.getElementById('details-modal');
	const body = document.getElementById('details-modal-body');
	if (!modal || !body) return;

	const overview = lastReport?.overview ?? {};
	const primary = (Array.isArray(lastReport?.rooms) && lastReport.rooms.length > 0)
		? (lastReport.rooms.find(r => /living/i.test(r.name)) || lastReport.rooms[0])
		: null;
	const dims = primary?.dimensions || primary?.boundingBox || {};
	const inscribed = primary?.inscribed || {};

	const furnitureRows = Array.isArray(lastReport?.furniture) ? lastReport.furniture.map(f =>
		`<tr><td>${f.type || f.name || '—'}</td><td>${f.count ?? 1}</td><td>${f.notes || ''}</td></tr>`
	).join('') : '<tr><td>—</td><td>—</td><td>—</td></tr>';

	body.innerHTML = `
		<div class="details-sections">
			<div class="details-group">
				<h4>Building Totals</h4>
				<div class="kv"><div class="k">Exterior Floor Area</div><div class="v">${overview.totalExteriorFloorArea ?? '—'}</div></div>
				<div class="kv"><div class="k">Livable Floor Area</div><div class="v">${overview.totalLivableFloorArea ?? '—'}</div></div>
				<div class="kv"><div class="k">Wall Area</div><div class="v">${overview.totalWallArea ?? '—'}</div></div>
				<div class="kv"><div class="k">Window Area</div><div class="v">${overview.totalWindowArea ?? '—'}</div></div>
				<div class="kv"><div class="k">Total Volume</div><div class="v">${overview.totalVolume ?? '—'}</div></div>
			</div>
			<div class="details-group">
				<h4>Primary Room</h4>
				<div class="kv"><div class="k">Name</div><div class="v">${primary?.name ?? '—'}</div></div>
				<div class="kv"><div class="k">Floor Area</div><div class="v">${primary?.floorArea ?? '—'}</div></div>
				<div class="kv"><div class="k">Dimensions (B)</div><div class="v">${dims.width ?? '—'} × ${dims.depth ?? '—'} ${dims.height ? '× ' + dims.height : ''}</div></div>
				<div class="kv"><div class="k">Dimensions (I)</div><div class="v">${inscribed.width ?? '—'} × ${inscribed.depth ?? '—'}</div></div>
				<div class="kv"><div class="k">Wall Area (incl.)</div><div class="v">${primary?.wallAreaInclOpenings ?? '—'}</div></div>
				<div class="kv"><div class="k">Wall Area (excl.)</div><div class="v">${primary?.wallArea ?? '—'}</div></div>
				<div class="kv"><div class="k">Perimeter</div><div class="v">${primary?.perimeter ?? '—'}</div></div>
				<div class="kv"><div class="k">Ceiling Height</div><div class="v">${primary?.ceilingHeight ?? '—'}</div></div>
				<div class="kv"><div class="k">Room Volume</div><div class="v">${primary?.volume ?? '—'}</div></div>
			</div>
			<div class="details-group">
				<h4>Furniture</h4>
				<table class="table">
					<thead><tr><th>Type</th><th>Count</th><th>Notes</th></tr></thead>
					<tbody>${furnitureRows}</tbody>
				</table>
			</div>
		</div>
	`;

	modal.classList.remove('hidden');
}

function closeDetailsModal() {
	document.getElementById('details-modal')?.classList.add('hidden');
}
// Public: ensure bottom dock exists and is visible (for PLY tab too)
export async function ensureBottomDock() {
	if (!bottomDockEl) {
		createBottomDock();
		// Load info for charts/details
		await tryLoadFloorplanAssets();
	}
	bottomDockEl.style.display = 'grid';
}

// Public: refresh data bindings from sources (model_info.json, floorplan.png)
export async function refreshDashboardData() {
	await tryLoadFloorplanAssets();
}

async function importECharts() {
	if (echartsLib) return echartsLib;
	echartsLib = await import('https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.esm.min.js');
	return echartsLib;
}

async function initCharts() {
	const echarts = await importECharts();
	const usageEl = document.getElementById('chart-usage');
	const openingsEl = document.getElementById('chart-openings');
	if (!usageEl || !openingsEl) return;
	charts.usage = echarts.init(usageEl);
	charts.openings = echarts.init(openingsEl);
	// baseline options
	charts.usage.setOption({
		darkMode: true,
		textStyle: { color: 'rgba(255,255,255,0.9)' },
		tooltip: { trigger: 'item' },
		series: [{ type: 'pie', radius: ['42%', '68%'], data: [], label: { color: 'rgba(255,255,255,0.85)' } }]
	});
	charts.openings.setOption({
		darkMode: true,
		textStyle: { color: 'rgba(255,255,255,0.9)' },
		tooltip: { trigger: 'item' },
		series: [{ type: 'pie', radius: ['34%', '56%'], data: [], label: { color: 'rgba(255,255,255,0.85)' } }]
	});
	window.addEventListener('resize', () => {
		charts.usage?.resize();
		charts.openings?.resize();
	});
}

function updateUsageChart({ usedArea, unusedArea }) {
	if (!charts.usage) return;
	const parseNum = (s) => typeof s === 'string' ? parseFloat(s.replace(/[^\d.]/g, '')) : s;
	const used = parseNum(usedArea) || 0;
	const unused = parseNum(unusedArea) || 0;
	charts.usage.setOption({
		series: [{ data: [
			{ name: 'Used', value: used },
			{ name: 'Unused', value: unused }
		]}]
	});
}

function updateOpeningsChart({ wallArea, windowArea }) {
	if (!charts.openings) return;
	const parseNum = (s) => typeof s === 'string' ? parseFloat(s.replace(/[^\d.]/g, '')) : s;
	const wall = parseNum(wallArea) || 0;
	const windowA = parseNum(windowArea) || 0;
	charts.openings.setOption({
		series: [{ data: [
			{ name: 'Walls', value: Math.max(wall - windowA, 0) },
			{ name: 'Windows', value: windowA }
		]}]
	});
}
