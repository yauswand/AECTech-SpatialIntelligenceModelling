@echo off
REM Run Qwen VLM Detection Analysis
REM Analyzes YOLO detections and extracts architectural, spatial, and decor information

echo ========================================
echo QWEN VLM DETECTION ANALYZER
echo ========================================
echo.

REM Activate conda environment (if using conda)
REM call conda activate webapp
REM OR activate virtualenv if using that

REM Run the analysis script
python analyze_detections_with_qwen.py

echo.
echo ========================================
echo Analysis Complete
echo ========================================
pause

