import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.errors import register_error_handlers
from app.routers import accounts, auth, budgets, categories, dashboard, health, transactions

logging.basicConfig(level=settings.log_level.upper())

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"

app = FastAPI(title=settings.app_name, docs_url="/api/docs", redoc_url=None)
register_error_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(budgets.router)

if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")

PAGES = {
    "/": "index.html",
    "/login": "login.html",
    "/register": "register.html",
    "/operations": "operations.html",
    "/analytics": "analytics.html",
    "/budgets": "budgets.html",
    "/accounts": "accounts.html",
    "/assistant": "assistant.html",
    "/profile": "profile.html",
    "/settings": "settings.html",
    "/help": "help.html",
}


def _page(name: str) -> FileResponse:
    return FileResponse(FRONTEND_DIR / name)


for path, filename in PAGES.items():
    app.add_api_route(path, lambda filename=filename: _page(filename), methods=["GET"], include_in_schema=False)


@app.get("/{page_name}.html", include_in_schema=False)
def html_alias(page_name: str):
    target = FRONTEND_DIR / f"{page_name}.html"
    if target.exists():
        return FileResponse(target)
    return FileResponse(FRONTEND_DIR / "index.html")
