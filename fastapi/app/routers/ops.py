from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import Connection

from app.config import Settings
from app.deps import get_db, require_ops_access, settings_dep
from app.services.schema_export import build_schema_sql

router = APIRouter(prefix="/ops", tags=["ops"])


@router.get("/schema-export")
def schema_export(
    conn: Annotated[Connection, Depends(get_db)],
    settings: Annotated[Settings, Depends(settings_dep)],
    _auth: Annotated[dict, Depends(require_ops_access)],
) -> Response:
    body = build_schema_sql(
        conn,
        settings.mysql_host,
        settings.mysql_port,
        settings.mysql_database,
    )
    return Response(
        content=body,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="schema-export.sql"',
        },
    )
