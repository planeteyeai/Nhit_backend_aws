from functools import lru_cache
from urllib.parse import quote_plus

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


@lru_cache
def get_engine(
    mysql_host: str,
    mysql_port: int,
    mysql_user: str,
    mysql_password: str,
    mysql_database: str,
    mysql_ssl: str,
) -> Engine:
    pwd = quote_plus(mysql_password)
    user = quote_plus(mysql_user)
    url = f"mysql+pymysql://{user}:{pwd}@{mysql_host}:{mysql_port}/{mysql_database}"
    connect_args: dict = {}
    if mysql_ssl.lower() in ("1", "true", "yes"):
        connect_args["ssl"] = {}

    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        connect_args=connect_args,
        future=True,
    )


def engine_from_settings(settings) -> Engine:
    return get_engine(
        settings.mysql_host,
        settings.mysql_port,
        settings.mysql_user,
        settings.mysql_password,
        settings.mysql_database,
        settings.mysql_ssl,
    )
