from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.rate_limit import RateLimitMiddleware
from app.routers import billing, health, ingest, integrations, jobs, me, roasts

settings = get_settings()

app = FastAPI(title="Helix API")

app.add_middleware(
    RateLimitMiddleware,
    requests=settings.rate_limit_requests,
    window_seconds=settings.rate_limit_window_seconds,
)
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
