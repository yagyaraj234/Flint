"""Versioned application encryption for provider credentials."""

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

_VERSION = "v1"


class CredentialError(ValueError):
    """Credential cannot be encrypted or decrypted safely."""


def _fernet() -> Fernet:
    key = get_settings().langsmith_credential_key.encode()
    if not key:
        raise CredentialError("LANGSMITH_CREDENTIAL_KEY is not configured")
    try:
        return Fernet(key)
    except (TypeError, ValueError) as exc:
        raise CredentialError("LANGSMITH_CREDENTIAL_KEY is invalid") from exc


def encrypt_credential(value: str) -> str:
    if not value.strip():
        raise CredentialError("Credential is required")
    return f"{_VERSION}:{_fernet().encrypt(value.encode()).decode()}"


def decrypt_credential(ciphertext: str) -> str:
    version, separator, token = ciphertext.partition(":")
    if version != _VERSION or not separator or not token:
        raise CredentialError("Credential version is unsupported")
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise CredentialError("Credential cannot be decrypted") from exc
