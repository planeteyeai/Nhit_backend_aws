import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Connection, text

from app.deps import get_db, require_auth_user

router = APIRouter(prefix="/db", tags=["database"])

_SAFE_TABLE = re.compile(r"^[a-zA-Z0-9_]+$")


@router.get("/tables")
def list_tables(
    conn: Annotated[Connection, Depends(get_db)],
    _user: Annotated[dict, Depends(require_auth_user)],
) -> dict:
    rows = conn.execute(
        text(
            """
            SELECT TABLE_NAME AS name, TABLE_ROWS AS approx_rows
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY TABLE_NAME
            """
        )
    ).mappings().all()
    return {"ok": True, "tables": [dict(r) for r in rows]}


@router.get("/tables/{table_name}/columns")
def table_columns(
    table_name: str,
    conn: Annotated[Connection, Depends(get_db)],
    _user: Annotated[dict, Depends(require_auth_user)],
) -> dict:
    if not _SAFE_TABLE.match(table_name):
        raise HTTPException(status_code=400, detail="Invalid table name")
    rows = conn.execute(
        text(
            """
            SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type, IS_NULLABLE AS nullable,
                   COLUMN_KEY AS column_key, COLUMN_DEFAULT AS default_value
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t
            ORDER BY ORDINAL_POSITION
            """
        ),
        {"t": table_name},
    ).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"ok": True, "table": table_name, "columns": [dict(r) for r in rows]}
