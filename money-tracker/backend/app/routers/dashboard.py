from datetime import date

from app.database import get_db
from app.deps import get_current_user
from app.models import Budget, User
from app.schemas.dashboard import BudgetNotificationOut, DashboardOut
from app.services.finance import build_dashboard, spent_in_month
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/notifications", response_model=list[BudgetNotificationOut])
def budget_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    budgets = db.scalars(
        select(Budget)
        .options(joinedload(Budget.category))
        .where(
            Budget.user_id == user.id,
            Budget.year == today.year,
            Budget.month == today.month,
        )
        .order_by(Budget.category_id.nullsfirst())
    ).unique()
    notifications = []
    for budget in budgets:
        spent = spent_in_month(db, user.id, budget.year, budget.month, budget.category_id)
        if spent > budget.limit_minor:
            notifications.append(
                {
                    "budget_id": budget.id,
                    "category_name": budget.category.name if budget.category else None,
                    "year": budget.year,
                    "month": budget.month,
                    "spent_minor": spent,
                    "limit_minor": budget.limit_minor,
                    "exceeded_minor": spent - budget.limit_minor,
                }
            )
    return notifications


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
