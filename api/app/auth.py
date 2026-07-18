"""Supabase-backed FastAPI authentication dependencies."""

from typing import Annotated, Any

from fastapi import Header, HTTPException
from pydantic import BaseModel

from app.db import get_supabase


class AuthUser(BaseModel):
    id: str
    email: str | None = None


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=401, detail="invalid or missing authorization")


def _token_from_header(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _auth_user_for_token(token: str) -> AuthUser:
    try:
        response = get_supabase().auth.get_user(token)
        user: Any = getattr(response, "user", None)
        if user is None and isinstance(response, dict):
            user = response.get("user")
        user_id: Any = user.get("id") if isinstance(user, dict) else getattr(user, "id", None)
        email: Any = user.get("email") if isinstance(user, dict) else getattr(user, "email", None)
    except Exception as exc:
        raise _unauthorized() from exc
    if not isinstance(user_id, str) or not user_id:
        raise _unauthorized()
    return AuthUser(id=user_id, email=email if isinstance(email, str) else None)


def _user_id_for_token(token: str) -> str:
    return _auth_user_for_token(token).id


def optional_auth_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser | None:
    """Return token identity, or None only when no credentials were sent."""

    token = _token_from_header(authorization)
    return _auth_user_for_token(token) if token is not None else None


def required_auth_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser:
    """Return token identity, rejecting unauthenticated requests."""

    user = optional_auth_user(authorization)
    if user is None:
        raise _unauthorized()
    return user


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
