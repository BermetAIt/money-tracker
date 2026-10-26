from datetime import date

from pydantic import BaseModel

from app.schemas.finance import TransactionOut


class TrendPoint(BaseModel):
    day: date
    cumulative_minor: int
    spent_minor: int


class CategorySlice(BaseModel):
    category_id: int
    name: str
    color: str
    icon: str
    amount_minor: int
    percent: float


class BudgetProgress(BaseModel):
    limit_minor: int
    spent_minor: int
    remaining_minor: int
    percent: int
    daily_allowance_minor: int
    items: list[dict]


class DashboardOut(BaseModel):
    month: str
    month_label: str
    greeting_name: str
    currency: str
    balance_minor: int
    month_start_balance_minor: int
    income_minor: int
    expense_minor: int
    income_count: int
    expense_count: int
    category_count: int
    trend: list[TrendPoint]
    categories: list[CategorySlice]
    recent: list[TransactionOut]
    budget: BudgetProgress
