from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _truthy(v: str) -> bool:
    return str(v or "").strip().lower() in ("1", "true", "yes", "on")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = ""
    mysql_password: str = ""
    mysql_database: str = ""
    mysql_ssl: str = "0"

    port: int = 8000
    host: str = "0.0.0.0"
    cors_origin: str = ""
    node_env: str = Field(default="", validation_alias="NODE_ENV")

    enable_openapi_docs: str = Field(default="", validation_alias="ENABLE_OPENAPI_DOCS")

    jwt_secret: str = "bms-dev-secret-change-in-production"
    ops_api_key: str = Field(default="", description="Optional header X-Ops-Key for /v1/ops/*")


def get_settings() -> Settings:
    return Settings()


def openapi_enabled(settings: Settings, *, production: bool) -> bool:
    if not production:
        return True
    return _truthy(settings.enable_openapi_docs)
