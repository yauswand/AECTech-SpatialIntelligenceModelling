// Shopping List Component - Display identified furniture and search results
export class ShoppingList {
    constructor() {
        this.items = [];
        this.element = null;
    }

    create() {
        const list = document.createElement('div');
        list.id = 'shopping-list';
        list.className = 'shopping-list';
        
        list.innerHTML = `
            <div class="shopping-list-header">
                <h3>Shopping List</h3>
                <button id="close-shopping-list" class="btn-icon">×</button>
            </div>
            <div class="shopping-list-content" id="shopping-list-content">
                <p class="empty-message">No items yet. Furniture will appear here after identification.</p>
            </div>
        `;

        // Close button handler
        const closeBtn = list.querySelector('#close-shopping-list');
        closeBtn.addEventListener('click', () => {
            list.classList.add('hidden');
        });

        this.element = list;
        return list;
    }

    addItem(item) {
        this.items.push(item);
        this.render();
    }

    setItems(items) {
        this.items = items;
        this.render();
    }

    render() {
        const content = this.element.querySelector('#shopping-list-content');
        
        if (this.items.length === 0) {
            content.innerHTML = '<p class="empty-message">No items yet. Furniture will appear here after identification.</p>';
            return;
        }

        content.innerHTML = this.items.map((item, index) => `
            <div class="shopping-item" data-index="${index}">
                <div class="shopping-item-header">
                    <h4>${item.name || 'Furniture Item'}</h4>
                    ${item.price ? `<span class="price">${item.price}</span>` : ''}
                </div>
                ${item.description ? `<p class="item-description">${item.description}</p>` : ''}
                ${item.links && item.links.length > 0 ? `
                    <div class="item-links">
                        ${item.links.map(link => `
                            <a href="${link.url}" target="_blank" class="item-link">${link.title || 'View Product'}</a>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Show the shopping list
        this.element.classList.remove('hidden');
    }

    show() {
        this.element.classList.remove('hidden');
    }

    hide() {
        this.element.classList.add('hidden');
    }
}

