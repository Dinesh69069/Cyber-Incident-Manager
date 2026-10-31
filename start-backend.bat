@echo off
title Cyber Incident Platform - Backend (FastAPI)
echo Starting Cyber Incident Management Backend on http://127.0.0.1:8000 ...
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
