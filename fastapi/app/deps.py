from collections.abc import Generator
from typing import Annotated, Any

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import Connection

from app.config import Settings, get_settings
from app.db import engine_from_settings


def settings_dep() -> Settings:
    return get_settings()


def get_db(
    settings: Annotated[Settings, Depends(settings_dep)],
) -> Generator[Connection, None, None]:
    engine = engine_from_settings(settings)
    with engine.connect() as conn:
        yield conn


def optional_bearer_user(
    settings: Annotated[Settings, Depends(settings_dep)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any] | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
    except jwt.PyJWTError:
        return None


def require_auth_user(
    settings: Annotated[Settings, Depends(settings_dep)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:].strip()
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_ops_access(
    settings: Annotated[Settings, Depends(settings_dep)],
    authorization: Annotated[str | None, Header()] = None,
    x_ops_key: Annotated[str | None, Header(alias="X-Ops-Key")] = None,
) -> dict[str, Any]:
    if settings.ops_api_key and x_ops_key == settings.ops_api_key:
        return {"sub": "ops-key", "role": "ops"}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:].strip()
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
