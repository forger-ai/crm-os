from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.cors import allowed_origins
from app.database_ext import init_app_db
from app.health import router as health_router
from app.routers import (
    activities,
    contacts,
    custom_fields,
    deals,
    field_values,
    imports,
    lead_scoring,
    notes,
    organizations,
    pipelines,
    products,
    quotes,
    reports,
    search,
    sync,
)


def create_app() -> FastAPI:
    app = FastAPI(
        title="CRM OS API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup() -> None:
        init_app_db()

    @app.exception_handler(ValueError)
    async def value_error_handler(_request, exc: ValueError):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    app.include_router(health_router, prefix="/api")
    app.include_router(organizations.router)
    app.include_router(contacts.router)
    app.include_router(pipelines.router)
    app.include_router(deals.router)
    app.include_router(activities.router)
    app.include_router(notes.router)
    app.include_router(custom_fields.router)
    app.include_router(imports.router)
    app.include_router(reports.router)
    app.include_router(search.router)
    app.include_router(field_values.router)
    app.include_router(sync.router)
    app.include_router(products.router)
    app.include_router(quotes.router)
    app.include_router(lead_scoring.router)
    return app


app = create_app()
