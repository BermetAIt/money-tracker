from calendar import monthrange
from datetime import date

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import Account, Budget, Category, Transaction

MONTHS_RU = [
    "",
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
]
MONTHS_RU_GEN = [
    "",
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
]


def month_bounds(year: int, month: int) -> tuple[date, date]:
    last = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


def signed_amount(tx: Transaction, account_id: int | None = None) -> int:
    if tx.type == "income":
        return tx.amount_minor
    if tx.type == "expense":
        return -tx.amount_minor
    if tx.type == "transfer":
        if account_id is None:
            return 0
        if tx.account_id == account_id:
            return -tx.amount_minor
        if tx.to_account_id == account_id:
            return tx.amount_minor
    return 0


def account_balance(db: Session, user_id: int, account_id: int, until: date | None = None) -> int:
    stmt: Select = select(Transaction).where(
        Transaction.user_id == user_id,
        or_(Transaction.account_id == account_id, Transaction.to_account_id == account_id),
    )
    if until is not None:
        stmt = stmt.where(Transaction.occurred_on <= until)
    total = 0
    for tx in db.scalars(stmt):
        total += signed_amount(tx, account_id)
    return total


def total_balance(db: Session, user_id: int, until: date | None = None) -> int:
    accounts = db.scalars(select(Account.id).where(Account.user_id == user_id)).all()
    return sum(account_balance(db, user_id, account_id, until) for account_id in accounts)


def serialize_transaction(tx: Transaction) -> dict:
    category = tx.category
    return {
        "id": tx.id,
        "account_id": tx.account_id,
        "account_name": tx.account.name if tx.account else "",
        "to_account_id": tx.to_account_id,
        "category_id": tx.category_id,
        "category_name": category.name if category else None,
        "category_color": category.color if category else None,
        "category_icon": category.icon if category else None,
        "type": tx.type,
        "amount_minor": tx.amount_minor,
        "occurred_on": tx.occurred_on,
        "title": tx.title,
        "note": tx.note or "",
    }


def load_month_transactions(db: Session, user_id: int, start: date, end: date) -> list[Transaction]:
    stmt = (
        select(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.account))
        .where(
            Transaction.user_id == user_id,
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
        .order_by(Transaction.occurred_on.desc(), Transaction.id.desc())
    )
    return list(db.scalars(stmt).unique())


def budget_status(percent: int) -> str:
    if percent >= 100:
        return "over"
    if percent >= 80:
        return "near"
    return "ok"


def build_dashboard(db: Session, user_id: int, year: int, month: int, greeting_name: str, currency: str) -> dict:
    start, end = month_bounds(year, month)
    txs = load_month_transactions(db, user_id, start, end)
    expenses = [tx for tx in txs if tx.type == "expense"]
    incomes = [tx for tx in txs if tx.type == "income"]
    expense_minor = sum(tx.amount_minor for tx in expenses)
    income_minor = sum(tx.amount_minor for tx in incomes)
    day_before = date(year, month, 1).fromordinal(start.toordinal() - 1)
    month_start_balance = total_balance(db, user_id, day_before)
    balance = total_balance(db, user_id)

    by_day: dict[date, int] = {}
    for tx in expenses:
        by_day[tx.occurred_on] = by_day.get(tx.occurred_on, 0) + tx.amount_minor
    trend = []
    running = 0
    cursor = start
    last_with_data = max(by_day) if by_day else start
    while cursor <= end and cursor <= last_with_data:
        running += by_day.get(cursor, 0)
        trend.append(
            {"day": cursor, "cumulative_minor": running, "spent_minor": by_day.get(cursor, 0)}
        )
        cursor = date.fromordinal(cursor.toordinal() + 1)

    cat_totals: dict[int, int] = {}
    cat_meta: dict[int, Category] = {}
    for tx in expenses:
        if not tx.category_id:
            continue
        cat_totals[tx.category_id] = cat_totals.get(tx.category_id, 0) + tx.amount_minor
        cat_meta[tx.category_id] = tx.category
    slices = []
    for cat_id, amount in sorted(cat_totals.items(), key=lambda item: item[1], reverse=True):
        cat = cat_meta[cat_id]
        percent = (amount / expense_minor * 100) if expense_minor else 0
        slices.append(
            {
                "category_id": cat_id,
                "name": cat.name,
                "color": cat.color,
                "icon": cat.icon,
                "amount_minor": amount,
                "percent": round(percent, 1),
            }
        )

    overall = db.scalar(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.year == year,
            Budget.month == month,
            Budget.category_id.is_(None),
        )
    )
    limit_minor = overall.limit_minor if overall else 0
    remaining = max(limit_minor - expense_minor, 0)
    today = date.today()
    if today.year == year and today.month == month:
        days_left = end.day - today.day + 1
    else:
        days_left = max(end.day, 1)
    daily = remaining // days_left if days_left else remaining
    percent = int(round(expense_minor / limit_minor * 100)) if limit_minor else 0

    cat_budgets = db.scalars(
        select(Budget)
        .options(joinedload(Budget.category))
        .where(
            Budget.user_id == user_id,
            Budget.year == year,
            Budget.month == month,
            Budget.category_id.is_not(None),
        )
    ).all()
    items = []
    for budget in cat_budgets:
        spent = cat_totals.get(budget.category_id, 0)
        item_percent = int(round(spent / budget.limit_minor * 100)) if budget.limit_minor else 0
        items.append(
            {
                "category_id": budget.category_id,
                "name": budget.category.name if budget.category else "",
                "spent_minor": spent,
                "limit_minor": budget.limit_minor,
                "percent": item_percent,
                "status": budget_status(item_percent),
            }
        )
    items.sort(key=lambda item: item["percent"], reverse=True)

    recent = [serialize_transaction(tx) for tx in txs[:5]]
    month_label = f"{MONTHS_RU[month].capitalize()} {year}"

    return {
        "month": f"{year:04d}-{month:02d}",
        "month_label": month_label,
        "greeting_name": greeting_name,
        "currency": currency,
        "balance_minor": balance,
        "month_start_balance_minor": month_start_balance,
        "income_minor": income_minor,
        "expense_minor": expense_minor,
        "income_count": len(incomes),
        "expense_count": len(expenses),
        "category_count": len(slices),
        "trend": trend,
        "categories": slices,
        "recent": recent,
        "budget": {
            "limit_minor": limit_minor,
            "spent_minor": expense_minor,
            "remaining_minor": remaining,
            "percent": percent,
            "daily_allowance_minor": daily,
            "items": items,
        },
    }


def spent_in_month(db: Session, user_id: int, year: int, month: int, category_id: int | None) -> int:
    start, end = month_bounds(year, month)
    stmt = select(func.coalesce(func.sum(Transaction.amount_minor), 0)).where(
        Transaction.user_id == user_id,
        Transaction.type == "expense",
        Transaction.occurred_on >= start,
        Transaction.occurred_on <= end,
    )
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    return int(db.scalar(stmt) or 0)
