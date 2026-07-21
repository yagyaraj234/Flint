"""Exercise the no-key API demo against a running Helix API."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.request import Request, urlopen

BASE_URL = os.environ.get("VERIFY_API_URL", "http://localhost:8000").rstrip("/")
TOKEN = "demo:demo%40helix.local"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
INTERNAL = {
    "X-Internal-Api-Token": "helix-demo-internal-token",
    "X-User-Id": TOKEN,
}


def call(
    path: str,
    *,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    method: str = "GET",
) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    request = Request(
        f"{BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method=method,
    )
    with urlopen(request, timeout=10) as response:
        payload = response.read()
    return json.loads(payload) if payload else None


def main() -> None:
    assert call("/health") == {"status": "ok"}

    batch = call(
        "/ingest/batch",
        method="POST",
        headers=AUTH,
        body={
            "source": "upload",
            "title": "Verification trace",
            "traces": [
                {
                    "trace_id": "verify-trace",
                    "workflow": "Verification workflow",
                    "spans": [
                        {
                            "id": "draft",
                            "type": "llm",
                            "name": "draft response",
                            "model": "gpt-4o-mini",
                            "input": "Summarize this support request.",
                            "output": "Draft ready.",
                            "usage": {"input_tokens": 80, "output_tokens": 40},
                        }
                    ],
                }
            ],
        },
    )
    slug = batch["results"][0]["slug"]
    roasts = call("/me/roasts", headers=AUTH)
    assert any(row["slug"] == slug for row in roasts)

    sharing = call(
        f"/me/roasts/{slug}/visibility",
        method="PUT",
        headers=AUTH,
        body={"visibility": "private"},
    )
    assert sharing["visibility"] == "private"
    sharing = call(
        f"/me/roasts/{slug}/shares",
        method="POST",
        headers=AUTH,
        body={"email": "viewer@example.com"},
    )
    assert sharing["shares"][0]["email"] == "viewer@example.com"

    assert call("/billing/status", headers=AUTH)["plan"] == "free"
    assert call("/billing/checkout", method="POST", headers=AUTH, body={}) == {
        "checkout_url": "/app/billing"
    }
    assert call("/billing/status", headers=AUTH)["plan"] == "pro"

    workspaces = call(
        "/integrations/langsmith/validate-key",
        method="POST",
        headers=INTERNAL,
        body={"endpoint": "https://api.smith.langchain.com", "api_key": "demo-key"},
    )
    workspace_id = workspaces["workspaces"][0]["id"]
    projects = call(
        "/integrations/langsmith/discover",
        method="POST",
        headers=INTERNAL,
        body={
            "endpoint": "https://api.smith.langchain.com",
            "api_key": "demo-key",
            "workspace_id": workspace_id,
        },
    )
    connection = call(
        "/integrations/langsmith",
        method="POST",
        headers=INTERNAL,
        body={
            "label": "Verification connection",
            "endpoint": "https://api.smith.langchain.com",
            "api_key": "demo-key",
            "workspace_id": workspace_id,
            "project_name": projects["projects"][0]["name"],
            "sync_cron": "0 * * * *",
        },
    )
    synced = call(
        f"/integrations/langsmith/{connection['id']}/sync",
        method="POST",
        headers=INTERNAL,
        body={},
    )
    assert synced["scanned"] == 1
    assert call(
        f"/integrations/langsmith/{connection['id']}",
        method="DELETE",
        headers=INTERNAL,
    ) is None
    print("Demo verification passed.")


if __name__ == "__main__":
    main()
