from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import billing, health, ingest, integrations, jobs, me, roasts

settings = get_settings()

app = FastAPI(title="Roast0 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(roasts.router)
app.include_router(me.router)
app.include_router(integrations.router)
app.include_router(jobs.router)
app.include_router(billing.router)
