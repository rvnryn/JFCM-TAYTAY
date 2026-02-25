import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from database.database import engine, Base
from app.models.appSettingModel import AppSetting  # Register table before create_all
from app.user_management import users as user_router
from app.auth import login as login_router
from app.auth import me as me_router
from app.auth import profile as profile_router
from app.jfcm_talks import upload_from_youtube as youtube_router
from app.upload_to_Gdrive import upload_to_gdrive_teaching as gdrive_router
from app.upload_to_Gdrive import upload_to_gdrive_SOW1 as gdrive_sow1_router
from app.upload_to_Gdrive import upload_to_gdrive_SOW2 as gdrive_sow2_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Shared rate limiter — imported by routers that need it
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.warning("Could not connect to database on startup: %s", e)
    yield

IS_DEBUG = os.getenv("DEBUG", "false").lower() == "true"

app = FastAPI(
    lifespan=lifespan,
    docs_url="/docs" if IS_DEBUG else None,
    redoc_url="/redoc" if IS_DEBUG else None,
    openapi_url="/openapi.json" if IS_DEBUG else None,
)

# Attach rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in FRONTEND_URL.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(login_router.router)
app.include_router(me_router.router)
app.include_router(profile_router.router)
app.include_router(user_router.router)
app.include_router(youtube_router.router)
app.include_router(gdrive_router.router)
app.include_router(gdrive_sow1_router.router)
app.include_router(gdrive_sow2_router.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}



