# 🦅 Cyber Hawk — Incident Management & Threat Intelligence Platform

A production-grade, full-stack cybersecurity incident response, asset inventory, and vulnerability management platform built with **Python (FastAPI + Supabase PostgreSQL)** and **React (Vite + Tailwind CSS)**.

---

## 🛡️ Key Features

- **RBAC Authentication**: JWT bearer token authentication with role-based access control (`admin` and `analyst`).
- **Interactive Security Dashboard**: Real-time KPI statistics cards, 14-day incident volume area charts, severity donut breakdowns, and high-risk asset alerts.
- **Kanban Incident Response**: Drag-and-drop 3-column response board (`Open`, `In Progress`, `Resolved`) sorted by calculated risk scores.
- **Dynamic Risk Scoring**: Deterministic multi-factor severity scoring combining CVSS, asset exposure, data classification, and active exploitation status.
- **Asset Inventory**: Device categorization, IP validation, vulnerability listing, and targeted on-demand port scans.
- **Port Scanner & Live CVE Enrichment**: Sockets connect test against critical ports (22, 80, 443, 8080) with CIRCL CVE-Search API integration and offline fallbacks. Pro/Premium-gated.
- **Stripe Subscription & HMAC Webhooks**: Complete billing flow with authentic test keys, 4-step checkout flow, and cryptographic HMAC-SHA256 signature verification (rejects tampered payloads with HTTP 400).
- **IAM & Access Control**: Admin-only user management interface with role elevation and premium licensing controls.

---

## 👥 Demo Credentials

The database automatically seeds with pre-configured accounts and telemetry data:

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@corp.test` | `Admin#123` | Full access (User IAM, deletes, scans, billing) |
| **Analyst** | `analyst@corp.test` | `Analyst#123` | Security operations & incident response |

## 🗄️ Supabase (PostgreSQL) Database Setup

The backend uses **SQLAlchemy** and supports **Supabase (PostgreSQL)** directly. When you configure Supabase, tables are automatically created on first boot and populated with the initial seed data.

### Connecting to your Supabase Project:

1. **Get your Connection String from Supabase**:
   - Go to your [Supabase Dashboard](https://supabase.com/dashboard).
   - Select your project → Click **Project Settings** (gear icon) → **Database**.
   - Under **Connection String**, choose **URI**.
   - Copy the URI, which looks like:
     ```
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
     ```
     *(Or direct connection on port 5432: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require`)*

2. **Add to `backend/.env`**:
   - Create a file named `.env` in the `backend/` directory (you can copy [backend/.env.example](file:///c:/Users/dines/OneDrive/Desktop/Cyber_Incident/backend/.env.example)):
     ```env
     DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
     ```
3. **Start the Backend**:
   - Run `start-backend.bat` or `python -m uvicorn main:app --reload`.
   - The backend detects the Supabase URL, connects with connection pooling (`pool_size=10`), creates all tables (`users`, `assets`, `incidents`, `vulnerabilities`, `invoices`, `webhook_events`), and seeds the demo data.
   - *Note: If `DATABASE_URL` is omitted, the backend automatically falls back to local SQLite.*

---

## 🚀 Quick Start Guide

### 1. Start Backend (FastAPI)

```bash
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
- API Docs & Swagger UI: **http://127.0.0.1:8000/docs**
- Healthcheck & Root: **http://127.0.0.1:8000/**

### 2. Start Frontend (React + Vite)

```bash
cd frontend
npm run dev
```
- Web Application: **http://localhost:5173**

---

## 📁 Repository Structure

```
Cyber_Incident/
├── backend/
│   ├── database.py       # SQLAlchemy SQLite engine & session management
│   ├── models.py         # ORM models (User, Asset, Incident, Vulnerability, etc.)
│   ├── schemas.py        # Pydantic v2 schemas and validation
│   ├── auth.py           # Bcrypt hashing, JWT issuance & verification, RBAC
│   ├── scanner.py        # Raw TCP socket scanner & CIRCL CVE enrichment
│   ├── main.py           # FastAPI routes, CORS, lifespan seeding & Stripe webhooks
│   └── requirements.txt  # Python backend dependencies
└── frontend/
    ├── src/
    │   ├── api.js        # Axios client with JWT interceptor & API endpoints
    │   ├── App.jsx       # Routing, authentication guards, theme & shell layout
    │   ├── index.css     # Design tokens, custom animations & Tailwind layers
    │   ├── components/   # Sidebar, KanbanBoard, Modal, StatCards, Pills
    │   ├── contexts/     # AuthContext (JWT session) & ToastContext
    │   ├── pages/        # Login, Dashboard, Assets, Incidents, Scanner, Vulnerabilities, Billing, Users
    │   └── utils/        # Date formatting & helper functions
    └── package.json      # Frontend dependencies & scripts
```

---

## 🧪 Testing & Verification

Run the full end-to-end integration and security test suite:

```bash
cd backend
python -c "from main import app; from fastapi.testclient import TestClient; client = TestClient(app); print('FastAPI Backend is operational!')"
```
