"""Supabase-backed FastAPI authentication dependencies."""

from typing import Annotated, Any

from fastapi import Header, HTTPException

from app.db import get_supabase


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=401, detail="invalid or missing authorization")


def _token_from_header(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _user_id_for_token(token: str) -> str:
    try:
        response = get_supabase().auth.get_user(token)
        user: Any = getattr(response, "user", None)
        user_id: Any = getattr(user, "id", None)
        if user_id is None and isinstance(response, dict):
            response_user = response.get("user")
            user_id = (
                response_user.get("id")
                if isinstance(response_user, dict)
                else getattr(response_user, "id", None)
            )
    except Exception as exc:
        raise _unauthorized() from exc
    if not isinstance(user_id, str) or not user_id:
        raise _unauthorized()
    return user_id


def optional_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str | None:
    """Return the token owner, or None only when no credentials were sent."""

    token = _token_from_header(authorization)
    return _user_id_for_token(token) if token is not None else None


def required_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Return the token owner, rejecting unauthenticated requests."""

    user_id = optional_user_id(authorization)
    if user_id is None:
        raise _unauthorized()
    return user_id
