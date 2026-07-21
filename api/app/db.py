from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings
from app.demo import DemoSupabase


@lru_cache
def get_supabase() -> Client | DemoSupabase:
    settings = get_settings()
    if getattr(settings, "helix_demo", False):
        return DemoSupabase()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
