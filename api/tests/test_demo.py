"""No-key demo mode must cover the user-visible provider flows."""

from fastapi.testclient import TestClient
import pytest

from app.config import get_settings
from app.db import get_supabase
from app.main import app


def test_demo_mode_runs_scan_billing_and_langsmith_without_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HELIX_DEMO", "true")
    get_settings.cache_clear()
    get_supabase.cache_clear()
    client = TestClient(app)
    token = "demo:demo%40helix.local"
    auth = {"Authorization": f"Bearer {token}"}
    internal = {
        "X-Internal-Api-Token": "helix-demo-internal-token",
        "X-User-Id": token,
    }
    try:
        response = client.post(
            "/ingest/batch",
            headers=auth,
            json={
                "source": "upload",
                "traces": [
                    {
                        "trace_id": "demo-test",
                        "workflow": "Demo test",
                        "spans": [
                            {
                                "id": "draft",
                                "type": "llm",
                                "name": "draft",
                                "model": "gpt-4o-mini",
                                "input": "Summarize this support request.",
                                "output": "Draft ready.",
                            }
                        ],
                    }
                ],
            },
        )
        assert response.status_code == 200
        slug = response.json()["results"][0]["slug"]
        assert any(row["slug"] == slug for row in client.get("/me/roasts", headers=auth).json())

        assert client.get("/billing/status", headers=auth).json()["plan"] == "free"
        assert client.post("/billing/checkout", headers=auth).json() == {
            "checkout_url": "/app/billing"
        }
        assert client.get("/billing/status", headers=auth).json()["plan"] == "pro"

        workspaces = client.post(
            "/integrations/langsmith/validate-key",
            headers=internal,
            json={"endpoint": "https://api.smith.langchain.com", "api_key": "demo-key"},
        )
        assert workspaces.status_code == 200
        workspace_id = workspaces.json()["workspaces"][0]["id"]
        projects = client.post(
            "/integrations/langsmith/discover",
            headers=internal,
            json={
                "endpoint": "https://api.smith.langchain.com",
                "api_key": "demo-key",
                "workspace_id": workspace_id,
            },
        )
        connection = client.post(
            "/integrations/langsmith",
            headers=internal,
            json={
                "label": "Demo connection",
                "endpoint": "https://api.smith.langchain.com",
                "api_key": "demo-key",
                "workspace_id": workspace_id,
                "project_name": projects.json()["projects"][0]["name"],
                "sync_cron": "0 * * * *",
            },
        )
        assert connection.status_code == 200
        synced = client.post(
            f"/integrations/langsmith/{connection.json()['id']}/sync",
            headers=internal,
        )
        assert synced.status_code == 200
        assert synced.json()["scanned"] == 1
    finally:
        get_supabase.cache_clear()
        get_settings.cache_clear()
