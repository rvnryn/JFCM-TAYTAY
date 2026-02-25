# JFCM Taytay Web App

A full-stack web application for **Jesus First Christian Ministries Taytay** — managing teachings, JFCM Talks videos, School of Workers modules, and user accounts.

---

## 🌐 Live URLs

| Service | URL |
|---|---|
| Frontend | https://jfcm-taytay.vercel.app |
| Backend API | https://jfcm-taytay.onrender.com |

---

## 🗂️ Project Structure

```
jfcm-taytay/
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── main.py           # App entry point, CORS config
│   │   ├── database.py       # SQLAlchemy DB connection
│   │   ├── models/
│   │   │   ├── userModel.py  # User ORM model
│   │   │   └── videoModel.py # Video ORM model
│   │   ├── auth/
│   │   │   ├── auth.py       # Login / register endpoints
│   │   │   ├── profile.py    # Profile picture upload/remove
│   │   │   ├── users.py      # User management endpoints
│   │   │   └── utils/
│   │   │       └── authUtils.py  # JWT + Argon2 password hashing
│   │   ├── routes/
│   │   │   ├── teachings.py  # Teachings Google Drive routes
│   │   │   ├── sow1.py       # SOW 1 Google Drive routes
│   │   │   ├── sow2.py       # SOW 2 Google Drive routes
│   │   │   └── jfcm_talks.py # JFCM Talks video routes
│   │   └── utils/
│   │       └── cache.py      # In-memory TTL cache
│   ├── .env                  # Environment variables (not committed)
│   └── requirements.txt
│
└── jfcm-taytay/              # Frontend (Vanilla HTML/CSS/JS)
    ├── config.js             # Auto-detects API base URL (local vs production)
    ├── dashboard/
    │   ├── dashboard.html
    │   ├── shared-script.js  # Sidebar, auth guards, role-based UI
    │   └── shared-styles.css
    ├── login/
    ├── profile/
    ├── teachings/
    ├── jfcm-talks/
    ├── modules/
    ├── sow1/
    ├── sow2/
    └── user-management/
```

---

## ⚙️ Tech Stack

**Frontend**
- HTML, CSS, JavaScript
- Hosted on **Vercel**

**Backend**
- **FastAPI** (Python)
- **SQLAlchemy** ORM
- **PostgreSQL** via **Supabase**
- **Google Drive API** (file storage for teachings/SOW)
- **JWT** authentication
- **Argon2** password hashing
- Hosted on **Render**

---

## 🚀 Local Development

### Backend

```powershell
cd jfcm-taytay\backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at `http://127.0.0.1:8000`

### Frontend

Open with **Live Server** (VS Code extension) on port `5500`:
```
http://127.0.0.1:5500/jfcm-taytay/dashboard/dashboard.html
```

### Environment Variables (`.env`)

```env
DATABASE_URL=postgresql://...
SECRET_KEY=your_secret_key
FRONTEND_URL=http://localhost:5500,http://127.0.0.1:5500,http://localhost:5173
DEBUG=true
```

---

## 👥 Roles

| Role | Permissions |
|---|---|
| `admin` | Full access — upload, delete, manage users |
| `user` | View only — browse teachings, talks, modules |

---

## 🔑 Key Features

- **JWT Authentication** — login, token refresh, protected routes
- **Profile Pictures** — stored as base64 in PostgreSQL (persistent across deploys)
- **Google Drive Integration** — multi-account support, parallel file fetching
- **In-memory TTL Cache** — reduces repeated API/Drive calls (60s for Drive, 30s for videos)
- **Role-based UI** — admin-only buttons/pages hidden from regular users
- **Stale-while-revalidate** — cached data shown instantly, fresh data loads in background

---

## 📦 Deployment

**Backend → Render**
```powershell
git push origin main  # Render auto-deploys from main branch
```

**Frontend → Vercel**
```powershell
git push origin main  # Vercel auto-deploys from main branch
```

---

## 📄 License

Internal use only — © 2026 JFCM Taytay. All rights reserved.
