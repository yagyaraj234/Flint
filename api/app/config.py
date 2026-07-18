from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    openai_api_key: str = ""
    roast_model: str = "gpt-5.6-terra"
    cors_origins: list[str] = ["http://localhost:3000"]
    internal_api_token: str = ""
    cron_secret: str = ""
    langsmith_credential_key: str = ""
    langsmith_sync_batch_size: int = 50
    langsmith_initial_lookback_hours: int = 24
    langsmith_sync_overlap_seconds: int = 120
    langsmith_sync_lease_seconds: int = 900

    model_config = {"env_file": ".env"}

    @field_validator("roast_model", mode="before")
    @classmethod
    def default_roast_model(cls, value: str | None) -> str:
        return value.strip() if isinstance(value, str) and value.strip() else "gpt-5.6-terra"


@lru_cache
def get_settings() -> Settings:
    return Settings()
