from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path

try:
    import keyring
except ImportError:  # pragma: no cover - falls back to encrypted local file
    keyring = None

try:
    from cryptography.fernet import Fernet
except ImportError:  # pragma: no cover - tiny fallback for local-only storage
    Fernet = None

SERVICE_NAME = "portfolio-puffin"
SECRET_KEY = "portfolio-puffin-secret-key"
SECRET_FILE = Path(__file__).resolve().parent.parent / "data" / "portfolio_puffin_secrets.json"


def _ensure_dir() -> None:
    SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)


def _fallback_secret_key() -> str:
    value = os.environ.get("PORTFOLIO_PUFFIN_SECRET_KEY")
    if value:
        return value
    return hashlib.sha256(b"portfolio-puffin-local-secret").hexdigest()


def _fernet_key() -> bytes:
    if Fernet is not None:
        return base64.urlsafe_b64encode(hashlib.sha256(_fallback_secret_key().encode()).digest())
    return b""


def _load_secret_store() -> dict[str, str]:
    _ensure_dir()
    if SECRET_FILE.exists():
        try:
            data = json.loads(SECRET_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {str(k): str(v) for k, v in data.items()}
        except (TypeError, ValueError):
            pass
    return {}


def _write_secret_store(data: dict[str, str]) -> None:
    _ensure_dir()
    SECRET_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    try:
        os.chmod(SECRET_FILE, 0o600)
    except OSError:
        pass


def _get_keyring_value(name: str) -> str | None:
    if keyring is None:
        return None
    try:
        return keyring.get_password(SERVICE_NAME, name)
    except Exception:  # pragma: no cover - OS keychain may be unavailable
        return None


def _set_keyring_value(name: str, value: str) -> None:
    if keyring is None:
        return
    try:
        keyring.set_password(SERVICE_NAME, name, value)
    except Exception:  # pragma: no cover
        pass


def _delete_keyring_value(name: str) -> None:
    if keyring is None:
        return
    try:
        keyring.delete_password(SERVICE_NAME, name)
    except Exception:  # pragma: no cover
        pass


def save_secret(name: str, value: str) -> None:
    if not value:
        return
    if keyring is not None:
        try:
            _set_keyring_value(name, value)
            return
        except Exception:  # pragma: no cover - fall back to local encrypted store
            pass
    if Fernet is not None:
        store = _load_secret_store()
        token = Fernet(_fernet_key()).encrypt(value.encode()).decode()
        store[name] = token
        _write_secret_store(store)
        return
    store = _load_secret_store()
    key = hashlib.sha256(_fallback_secret_key().encode()).digest()
    encoded = value.encode()
    encrypted = bytes([encoded[i] ^ key[i % len(key)] for i in range(len(encoded))])
    store[name] = base64.b64encode(encrypted).decode()
    _write_secret_store(store)


def get_secret(name: str) -> str:
    if keyring is not None:
        value = _get_keyring_value(name)
        if value:
            return value
    store = _load_secret_store()
    encrypted = store.get(name)
    if not encrypted:
        return ""
    if Fernet is not None:
        try:
            return Fernet(_fernet_key()).decrypt(encrypted.encode()).decode()
        except Exception:
            return ""
    key = hashlib.sha256(_fallback_secret_key().encode()).digest()
    try:
        decoded = base64.b64decode(encrypted.encode())
        return bytes([decoded[i] ^ key[i % len(key)] for i in range(len(decoded))]).decode()
    except Exception:
        return ""


def delete_secret(name: str) -> None:
    _delete_keyring_value(name)
    store = _load_secret_store()
    if name in store:
        del store[name]
        _write_secret_store(store)
