from fastapi import FastAPI
from database.database import engine, Base
from app.user_management import users as user_router
from app.auth import login as login_router
from app.auth import me as me_router
from app.auth import profile as profile_router
from app.jfcm_talks import upload_from_youtube as youtube_router
from app.upload_to_Gdrive import upload_to_gdrive_teaching as gdrive_router
from app.upload_to_Gdrive import upload_to_gdrive_SOW1 as gdrive_sow1_router
from app.upload_to_Gdrive import upload_to_gdrive_SOW2 as gdrive_sow2_router


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

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



