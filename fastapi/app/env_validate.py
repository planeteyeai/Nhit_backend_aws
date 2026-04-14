from app.config import Settings

_WEAK_JWT = frozenset(
    {
        "bms-dev-secret-change-in-production",
        "change-me-in-production",
        "change-me-in-development-only",
    }
)


def is_production(settings: Settings) -> bool:
    return (settings.node_env or "").strip().lower() == "production"


def validate_production_settings(settings: Settings) -> None:
    if not is_production(settings):
        return
    if not (settings.mysql_host or "").strip():
        raise RuntimeError("Production requires MYSQL_HOST")
    if not (settings.mysql_user or "").strip():
        raise RuntimeError("Production requires MYSQL_USER")
    if settings.mysql_password is None or str(settings.mysql_password).strip() == "":
        raise RuntimeError("Production requires MYSQL_PASSWORD")
    if not (settings.mysql_database or "").strip():
        raise RuntimeError("Production requires MYSQL_DATABASE")
    jwt = (settings.jwt_secret or "").strip()
    if len(jwt) < 16 or jwt in _WEAK_JWT:
        raise RuntimeError(
            "Production requires JWT_SECRET: random string at least 16 characters (not a default placeholder)"
        )
    if not (settings.cors_origin or "").strip():
        raise RuntimeError("Production requires CORS_ORIGIN (comma-separated allowed browser origins)")
