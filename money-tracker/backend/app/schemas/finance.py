from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    currency: str
    goal_amount_minor: int
    balance_minor: int = 0


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: str
    color: str
    icon: str


class TransactionIn(BaseModel):
    account_id: int
    to_account_id: int | None = None
    category_id: int | None = None
    type: str = Field(pattern="^(expense|income|transfer)$")
    amount_minor: int = Field(gt=0)
    occurred_on: date
    title: str = Field(min_length=1, max_length=120)
    note: str = Field(default="", max_length=500)


class TransactionOut(BaseModel):
    id: int
    account_id: int
    account_name: str
    to_account_id: int | None
    category_id: int | None
    category_name: str | None
    category_color: str | None
    category_icon: str | None
    type: str
    amount_minor: int
    occurred_on: date
    title: str
    note: str


class BudgetIn(BaseModel):
    category_id: int | None = None
    year: int
    month: int = Field(ge=1, le=12)
    limit_minor: int = Field(ge=0)


class BudgetOut(BaseModel):
    id: int
    category_id: int | None
    category_name: str | None
    year: int
    month: int
    limit_minor: int
    spent_minor: int
    percent: int
    status: str
