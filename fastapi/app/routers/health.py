from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import Connection, text

from app.config import Settings
from app.deps import get_db, settings_dep

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"ok": True, "service": "bms-fastapi"}


@router.get("/db/ping")
def db_ping(
    conn: Annotated[Connection, Depends(get_db)],
    settings: Annotated[Settings, Depends(settings_dep)],
) -> dict:
    conn.execute(text("SELECT 1"))
    row = conn.execute(text("SELECT DATABASE() AS db, VERSION() AS version")).mappings().first()
    return {
        "ok": True,
        "database": dict(row) if row else {},
        "configured_database": settings.mysql_database,
    }
