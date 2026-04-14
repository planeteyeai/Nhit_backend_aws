import re
from datetime import UTC, datetime

from sqlalchemy import Connection, text

from app.pdf_table_order import PDF_TABLE_ORDER

_SAFE_TABLE = re.compile(r"^[a-zA-Z0-9_]+$")


def _unique(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in seq:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def build_schema_sql(
    conn: Connection,
    mysql_host: str,
    mysql_port: int,
    mysql_database: str,
) -> str:
    rows = conn.execute(text("SHOW TABLES")).fetchall()
    if not rows:
        actual_tables: list[str] = []
    else:
        actual_tables = [row[0] for row in rows]

    actual_set = set(actual_tables)
    pdf_ordered = _unique(PDF_TABLE_ORDER)
    ordered = [t for t in pdf_ordered if t in actual_set]
    missing_from_db = [t for t in pdf_ordered if t not in actual_set]
    pdf_set = set(pdf_ordered)
    extra_in_db = [t for t in actual_tables if t not in pdf_set]

    chunks: list[str] = []
    chunks.append("-- Generated via backend/fastapi /v1/ops/schema-export")
    chunks.append(f"-- Source DB: {mysql_database} @ {mysql_host}:{mysql_port}")
    chunks.append(f"-- Generated at: {datetime.now(UTC).isoformat()}")
    chunks.append("")

    if missing_from_db:
        chunks.append("-- WARNING: tables listed in PDF order but missing in DB:")
        for t in missing_from_db:
            chunks.append(f"--   - {t}")
        chunks.append("")
    if extra_in_db:
        chunks.append("-- NOTE: tables present in DB but not in PDF TOC list:")
        for t in extra_in_db:
            chunks.append(f"--   - {t}")
        chunks.append("")

    chunks.append("SET FOREIGN_KEY_CHECKS=0;")
    chunks.append("")

    for table in ordered:
        if not _SAFE_TABLE.match(table):
            continue
        m = conn.execute(text(f"SHOW CREATE TABLE `{table}`")).mappings().first()
        if not m:
            continue
        create_sql = m["Create Table"]
        chunks.append("-- ----------------------------")
        chunks.append(f"-- Table: {table}")
        chunks.append("-- ----------------------------")
        chunks.append(f"DROP TABLE IF EXISTS `{table}`;")
        chunks.append(create_sql + ";")
        chunks.append("")

    chunks.append("SET FOREIGN_KEY_CHECKS=1;")
    chunks.append("")

    return "\n".join(chunks)
