from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import Budget, Category, User
from app.schemas.finance import BudgetIn, BudgetOut
from app.services.finance import budget_status, spent_in_month

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def _to_out(db: Session, user_id: int, budget: Budget) -> BudgetOut:
    spent = spent_in_month(db, user_id, budget.year, budget.month, budget.category_id)
    percent = int(round(spent / budget.limit_minor * 100)) if budget.limit_minor else 0
    return BudgetOut(
        id=budget.id,
        category_id=budget.category_id,
        category_name=budget.category.name if budget.category else None,
        year=budget.year,
        month=budget.month,
        limit_minor=budget.limit_minor,
        spent_minor=spent,
        percent=percent,
        status=budget_status(percent),
    )


@router.get("", response_model=list[BudgetOut])
def list_budgets(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Budget)
        .options(joinedload(Budget.category))
        .where(Budget.user_id == user.id)
        .order_by(Budget.category_id.nullsfirst())
    )
    if month:
        year, mon = (int(part) for part in month.split("-"))
        stmt = stmt.where(Budget.year == year, Budget.month == mon)
    return [_to_out(db, user.id, budget) for budget in db.scalars(stmt).unique()]


@router.put("", response_model=BudgetOut)
def upsert_budget(
    payload: BudgetIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.category_id is not None:
        category = db.scalar(
            select(Category).where(Category.id == payload.category_id, Category.user_id == user.id)
        )
        if category is None:
            raise HTTPException(status_code=404, detail="Категория не найдена")
    budget = db.scalar(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.year == payload.year,
            Budget.month == payload.month,
            Budget.category_id == payload.category_id
            if payload.category_id is not None
            else Budget.category_id.is_(None),
        )
    )
    if budget:
        budget.limit_minor = payload.limit_minor
    else:
        budget = Budget(user_id=user.id, **payload.model_dump())
        db.add(budget)
    db.commit()
    budget = db.scalar(
        select(Budget)
        .options(joinedload(Budget.category))
        .where(Budget.id == budget.id, Budget.user_id == user.id)
    )
    return _to_out(db, user.id, budget)
