from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings, openapi_enabled
from app.env_validate import is_production, validate_production_settings
from app.routers import database, health, ops


def create_app() -> FastAPI:
    settings = get_settings()
    validate_production_settings(settings)

    prod = is_production(settings)
    show_docs = openapi_enabled(settings, production=prod)
    app = FastAPI(
        title="BMS API (FastAPI)",
        version="1.0.0",
        docs_url="/docs" if show_docs else None,
        redoc_url="/redoc" if show_docs else None,
        openapi_url="/openapi.json" if show_docs else None,
    )

    raw = (settings.cors_origin or "").strip()
    if is_production(settings):
        allow_origins = [x.strip() for x in raw.split(",") if x.strip()]
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allow_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "Authorization", "X-Ops-Key"],
            exposed_headers=["Content-Disposition"],
        )
    elif raw:
        allow_origins = [x.strip() for x in raw.split(",") if x.strip()]
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allow_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "Authorization", "X-Ops-Key"],
            exposed_headers=["Content-Disposition"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=r"https?://.*",
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "Authorization", "X-Ops-Key"],
            exposed_headers=["Content-Disposition"],
        )

    app.include_router(health.router, prefix="/v1")
    app.include_router(database.router, prefix="/v1")
    app.include_router(ops.router, prefix="/v1")

    @app.get("/health")
    def root_health() -> dict:
        return {"ok": True, "service": "bms-fastapi"}

    return app


app = create_app()
