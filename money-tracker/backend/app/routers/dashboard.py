from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.dashboard import DashboardOut
from app.services.finance import build_dashboard

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        year, mon = (int(part) for part in month.split("-"))
    else:
        today = date.today()
        year, mon = today.year, today.month
    currency = user.settings.currency if user.settings else "KGS"
    first_name = user.name.split()[0] if user.name else "друг"
    return build_dashboard(db, user.id, year, mon, first_name, currency)
