# JFCM Taytay Web App

A full-stack web application for **Jesus First Christian Ministries Taytay** — managing teachings, JFCM Talks videos, School of Workers modules, and user accounts.

---

## 🌐 Live URLs

| Service | URL |
|---|---|
| Frontend | https://jfcm-taytay.vercel.app |
| Backend API | https://jfcm-taytay-backend.onrender.com |

---

## 🗂️ Project Structure

```
jfcm-taytay/                          # Git root
├── backend/                          # FastAPI backend
│   ├── app/
│   │   ├── main.py                   # App entry point, CORS, rate limiter
│   │   ├── auth/
│   │   │   ├── login.py              # Login endpoint
│   │   │   ├── me.py                 # Current user endpoint
│   │   │   ├── profile.py            # Profile picture upload/remove
│   │   │   ├── rbac.py               # Role-based access control
│   │   │   ├── config.py             # Auth config
│   │   │   └── utils/
│   │   │       ├── authUtils.py      # Argon2 password hashing
│   │   │       └── jwtUtils.py       # JWT encode/decode
│   │   ├── models/
│   │   │   ├── userModel.py          # User ORM model
│   │   │   ├── videoModel.py         # Video ORM model
│   │   │   ├── loginModel.py         # Login request schema
│   │   │   ├── user_credentialsModel.py
│   │   │   └── appSettingModel.py    # App settings ORM model
│   │   ├── jfcm_talks/
│   │   │   └── upload_from_youtube.py  # YouTube upload + video routes
│   │   ├── upload_to_Gdrive/
│   │   │   ├── upload_to_gdrive_teaching.py
│   │   │   ├── upload_to_gdrive_SOW1.py
│   │   │   └── upload_to_gdrive_SOW2.py
│   │   ├── user_management/
│   │   │   └── users.py              # User CRUD endpoints
│   │   └── utils/
│   │       └── cache.py              # In-memory TTL cache
│   ├── database/
│   │   ├── database.py               # SQLAlchemy engine + Base
│   │   └── deps.py                   # DB session dependency
│   ├── uploads/
│   │   └── profile_pictures/         # Stored profile images
│   ├── credentials.json              # Google Drive service account (not committed)
│   ├── .env                          # Environment variables (not committed)
│   └── requirements.txt
│
├── config.js                         # Auto-detects API base URL (local vs production)
├── index.html                        # Landing page
├── script.js
├── style.css
├── images/                           # Shared image assets
├── dashboard/
│   ├── dashboard.html
│   ├── dashboard.js
│   ├── dashboard.css
│   ├── shared-script.js              # Sidebar, auth guards, role-based UI
│   └── shared-styles.css
├── login/
│   ├── login.html
│   ├── login.js
│   └── login.css
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
- Vanilla HTML, CSS, JavaScript
- Hosted on **Vercel**

**Backend**
- **FastAPI** (Python)
- **SQLAlchemy** ORM
- **PostgreSQL** via **Supabase** (Southeast Asia — Singapore)
- **Google Drive API** (file storage for teachings/SOW modules)
- **JWT** authentication
- **Argon2** password hashing (`passlib`)
- **SlowAPI** rate limiting
- Hosted on **Render** (Southeast Asia — Singapore)

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
http://127.0.0.1:5500/login/login.html
```

### Environment Variables (`backend/.env`)

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

- **JWT Authentication** — login, token validation, protected routes
- **Role-based Access Control** — admin-only endpoints and UI elements
- **Profile Pictures** — uploaded and stored server-side in `uploads/profile_pictures/`
- **Google Drive Integration** — multi-account support, parallel file fetching
- **In-memory TTL Cache** — reduces repeated API/Drive calls
- **Rate Limiting** — SlowAPI protects login and sensitive endpoints
- **Keep-alive** — cron-job.org pings `/health` every 10 min to prevent Render cold starts

---

## 📦 Deployment

Both frontend (Vercel) and backend (Render) auto-deploy on push to `main`:

```powershell
git add <files>
git commit -m "your message"
git push
```

---

## 📄 License

Internal use only — © 2026 JFCM Taytay. All rights reserved.
