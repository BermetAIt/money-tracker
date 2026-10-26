from datetime import date

from sqlalchemy.orm import Session

from app.models import Account, Budget, Category, Goal, User, UserSettings

DEFAULT_CATEGORIES = [
    ("Жильё", "expense", "#14122B", "home"),
    ("Продукты", "expense", "#B9AEFF", "bag"),
    ("Кафе и рестораны", "expense", "#6D5DFB", "cafe"),
    ("Транспорт", "expense", "#A9A6C9", "car"),
    ("Подписки", "expense", "#DDDAF0", "loop"),
    ("Зарплата", "income", "#34298F", "income"),
]


def provision_user(
    db: Session,
    user: User,
    *,
    currency: str,
    monthly_income_minor: int,
    monthly_limit_minor: int,
    goal_name: str,
    goal_target_minor: int,
) -> None:
    db.add(
        UserSettings(
            user_id=user.id,
            currency=currency,
            monthly_income_minor=monthly_income_minor,
        )
    )
    db.add(
        Account(
            user_id=user.id,
            name="Основной счёт",
            type="card",
            currency=currency,
        )
    )
    for name, kind, color, icon in DEFAULT_CATEGORIES:
        db.add(
            Category(
                user_id=user.id,
                name=name,
                kind=kind,
                color=color,
                icon=icon,
                is_system=True,
            )
        )
    today = date.today()
    if monthly_limit_minor > 0:
        db.add(
            Budget(
                user_id=user.id,
                category_id=None,
                year=today.year,
                month=today.month,
                limit_minor=monthly_limit_minor,
            )
        )
    if goal_name and goal_target_minor > 0:
        db.add(Goal(user_id=user.id, name=goal_name, target_minor=goal_target_minor))
    db.flush()
