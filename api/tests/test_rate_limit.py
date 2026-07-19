from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.config import Settings
from app.rate_limit import RateLimitMiddleware


def _client() -> TestClient:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, requests=2, window_seconds=60)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3001"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/limited")
    def limited() -> dict[str, bool]:
        return {"ok": True}

    return TestClient(app)


def test_rate_limit_returns_retry_after_and_keeps_cors_headers() -> None:
    client = _client()
    headers = {"origin": "http://localhost:3001"}

    assert client.get("/limited", headers=headers).status_code == 200
    assert client.get("/limited", headers=headers).status_code == 200
    response = client.get("/limited", headers=headers)

    assert response.status_code == 429
    assert response.json() == {"detail": "rate_limit_exceeded"}
    assert response.headers["retry-after"] == "60"
    assert response.headers["access-control-allow-origin"] == "http://localhost:3001"


def test_rate_limit_keeps_authenticated_users_separate() -> None:
    client = _client()

    for _ in range(2):
        assert client.get("/limited", headers={"authorization": "Bearer user-one"}).status_code == 200
    assert client.get("/limited", headers={"authorization": "Bearer user-two"}).status_code == 200


def test_cors_origins_accept_comma_separated_env_value() -> None:
    settings = Settings(cors_origins="http://localhost:3000, http://localhost:3001")

    assert settings.cors_origins == ["http://localhost:3000", "http://localhost:3001"]
