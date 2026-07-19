"""Small in-process request limiter for the API edge."""

from collections import deque
from hashlib import sha256
from math import ceil
from threading import Lock
from time import monotonic

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp


# ponytail: buckets are per process; move them to shared storage before multiple API workers.
class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, *, requests: int, window_seconds: int) -> None:
        super().__init__(app)
        self.requests = requests
        self.window_seconds = window_seconds
        self._buckets: dict[str, deque[float]] = {}
        self._lock = Lock()

    @staticmethod
    def _client_key(request: Request) -> str:
        authorization = request.headers.get("authorization", "")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            return f"token:{sha256(token.encode()).hexdigest()}"
        client = request.client.host if request.client else "unknown"
        return f"ip:{client}"

    def _check(self, key: str) -> int | None:
        now = monotonic()
        with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            while bucket and now - bucket[0] >= self.window_seconds:
                bucket.popleft()
            if len(bucket) >= self.requests:
                return max(1, ceil(self.window_seconds - (now - bucket[0])))
            bucket.append(now)
        return None

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.method == "OPTIONS" or request.url.path == "/health":
            return await call_next(request)
        retry_after = self._check(self._client_key(request))
        if retry_after is not None:
            return JSONResponse(
                status_code=429,
                content={"detail": "rate_limit_exceeded"},
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)
