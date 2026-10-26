import json
import logging
from datetime import date
from typing import Literal

import httpx
from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import ChatMessage, User, UserSettings
from app.services.finance import build_dashboard
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/assistant", tags=["assistant"])
logger = logging.getLogger(__name__)


def configured_ai_provider() -> str | None:
    if settings.groq_api_key:
        return "Groq"
    if settings.openai_api_key:
        return "OpenAI"
    return None


class MessageContext(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=1200)
    history: list[MessageContext] = Field(default_factory=list, max_length=12)


def _finance_snapshot(db: Session, user: User, currency: str, year: int, month: int) -> dict:
    return build_dashboard(db, user.id, year, month, user.name, currency)


def _local_reply(prompt: str, snapshot: dict, previous: dict, currency: str) -> str:
    budget = snapshot["budget"]
    categories = snapshot["categories"]
    spent = snapshot["expense_minor"]
    limit = budget["limit_minor"]
    percent = budget["percent"]
    remaining = budget["remaining_minor"]
    daily = budget["daily_allowance_minor"]
    top_categories = sorted(categories, key=lambda item: item["amount_minor"], reverse=True)[:3]
    query = prompt.casefold()
    previous_spent = previous["expense_minor"]

    if any(word in query for word in ("сравн", "прошл", "вырос", "изменил")):
        difference = spent - previous_spent
        if difference == 0:
            return (
                f"Расходы за {snapshot['month_label'].lower()} такие же, как за "
                f"{previous['month_label'].lower()}: {format_money(spent, currency)}."
            )
        trend = "больше" if difference > 0 else "меньше"
        percent_change = round(abs(difference) / previous_spent * 100) if previous_spent else None
        change_text = (
            f"это на {percent_change}% {trend}"
            if percent_change is not None
            else "в прошлом месяце расходов не было"
        )
        return (
            f"В {snapshot['month_label'].lower()} расходы составили "
            f"{format_money(spent, currency)}, "
            f"а в {previous['month_label'].lower()} — {format_money(previous_spent, currency)}: "
            f"{change_text}."
        )
    if not spent:
        return (
            "Пока за этот месяц расходов нет, поэтому я ещё не могу сравнить категории. "
            "Добавьте операции — и здесь появится разбор ваших трат."
        )
    if any(
        word in query
        for word in ("категор", "куда", "больше всего", "основные траты", "еду", "продукт")
    ):
        requested_category = next(
            (item for item in categories if item["name"].casefold() in query),
            None,
        )
        if requested_category is None and any(word in query for word in ("еду", "продукт")):
            requested_category = next(
                (item for item in categories if "продукт" in item["name"].casefold()),
                None,
            )
        if requested_category:
            return (
                f"На категорию «{requested_category['name']}» за месяц ушло "
                f"{format_money(requested_category['amount_minor'], currency)} "
                f"({requested_category['percent']:.0f}% всех расходов)."
            )
        lines = [f"За месяц вы потратили {format_money(spent, currency)}. Больше всего ушло на:"]
        lines.extend(
            f"• {item['name']} — "
            f"{format_money(item['amount_minor'], currency)} ({item['percent']:.0f}%)"
            for item in top_categories
        )
        return "\n".join(lines)
    if any(word in query for word in ("сэконом", "сократ", "меньше трат", "накоп")):
        if top_categories:
            top = top_categories[0]
            suggestion = (
                f"Самая крупная категория — «{top['name']}» "
                f"({format_money(top['amount_minor'], currency)}). "
                "Попробуйте задать для неё недельный лимит и проверить результат в конце недели."
            )
        else:
            suggestion = (
                "Разделите крупные расходы на категории — так проще найти, где можно сэкономить."
            )
        if limit:
            suggestion += (
                f" По общему бюджету сейчас можно тратить около "
                f"{format_money(daily, currency)} в день."
            )
        return suggestion
    if any(word in query for word in ("бюджет", "лимит", "остал")):
        if not limit:
            return (
                f"За месяц вы потратили {format_money(spent, currency)}. "
                "Общий лимит пока не задан — его можно установить в разделе «Бюджеты»."
            )
        status = (
            "Лимит уже превышен."
            if percent >= 100
            else f"Осталось {format_money(remaining, currency)}."
        )
        return (
            f"Использовано {percent}% бюджета: {format_money(spent, currency)} из "
            f"{format_money(limit, currency)}. {status} Рекомендуемый темп — "
            f"около {format_money(daily, currency)} в день."
        )

    if limit:
        status = (
            f"Вы использовали {percent}% бюджета и можете тратить примерно "
            f"{format_money(daily, currency)} в день."
        )
    else:
        status = "Общий лимит пока не задан; его можно установить в разделе «Бюджеты»."
    summary = f"В этом месяце расходы составили {format_money(spent, currency)}. {status}"
    if top_categories:
        top = top_categories[0]
        summary += (
            f" Крупнейшая категория — «{top['name']}» "
            f"({format_money(top['amount_minor'], currency)})."
        )
    return summary


def format_money(amount_minor: int, currency: str) -> str:
    major = round(amount_minor / 100)
    formatted = f"{abs(major):,}".replace(",", " ")
    sign = "−" if major < 0 else ""
    symbols = {"KGS": "⃀", "RUB": "₽", "USD": "$", "EUR": "€"}
    return f"{sign}{formatted} {symbols.get(currency, '⃀')}"


async def _provider_reply(
    prompt: str,
    history: list[MessageContext],
    snapshot: dict,
    previous: dict,
    currency: str,
) -> str:
    provider = configured_ai_provider()
    if provider == "Groq":
        api_key = settings.groq_api_key
        api_url = "https://api.groq.com/openai/v1/chat/completions"
        model = settings.groq_model
    elif provider == "OpenAI":
        api_key = settings.openai_api_key
        api_url = "https://api.openai.com/v1/chat/completions"
        model = settings.openai_model
    else:
        raise HTTPException(status_code=503, detail="ИИ-провайдер не настроен.")

    context = {
        "month": snapshot["month_label"],
        "currency": currency,
        "income_minor": snapshot["income_minor"],
        "expenses_minor": snapshot["expense_minor"],
        "budget": snapshot["budget"],
        "expense_categories": snapshot["categories"],
        "previous_month": {
            "month": previous["month_label"],
            "income_minor": previous["income_minor"],
            "expenses_minor": previous["expense_minor"],
            "expense_categories": previous["categories"],
        },
    }
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                api_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 700,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Ты — финансовый помощник Money Tracker. Отвечай по-русски, "
                                "доброжелательно и конкретно. Используй только данные; "
                                "не выдумывай операции и не давай инвестиционных обещаний. "
                                "Денежные суммы "
                                "в контексте переданы в minor units (1/100 основной валюты). "
                                f"Финансовый контекст пользователя: "
                                f"{json.dumps(context, ensure_ascii=False)}"
                            ),
                        },
                        *[
                            {"role": message.role, "content": message.content}
                            for message in history
                        ],
                        {"role": "user", "content": prompt},
                    ],
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as error:
        logger.exception("%s assistant request failed", provider)
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось получить ответ {provider}. Проверьте ключ, модель и лимиты API.",
        ) from error

    text = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    if not text.strip():
        raise HTTPException(
            status_code=502,
            detail="ИИ-помощник вернул пустой ответ. Попробуйте задать вопрос ещё раз.",
        )
    return text.strip()


@router.get("/messages")
def list_messages(
    limit: int = Query(default=40, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.user_id == user.id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit)
        ).all()
    )
    rows.reverse()
    used_today = db.scalar(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.user_id == user.id,
            ChatMessage.role == "user",
            func.date(ChatMessage.created_at) == date.today().isoformat(),
        )
    )
    return {
        "messages": [
            {"id": row.id, "role": row.role, "content": row.content, "created_at": row.created_at}
            for row in rows
        ],
        "ai_enabled": configured_ai_provider() is not None,
        "ai_provider": configured_ai_provider(),
        "daily_limit": settings.ai_daily_limit,
        "used_today": used_today or 0,
    }


@router.post("/messages", status_code=201)
async def create_message(
    payload: MessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prompt = payload.content.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Введите вопрос.")

    today = date.today()
    settings_row = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    currency = settings_row.currency if settings_row else "KGS"
    snapshot = _finance_snapshot(db, user, currency, today.year, today.month)
    previous_date = date.fromordinal(date(today.year, today.month, 1).toordinal() - 1)
    previous = _finance_snapshot(db, user, currency, previous_date.year, previous_date.month)

    if configured_ai_provider():
        used_today = db.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.user_id == user.id,
                ChatMessage.role == "user",
                func.date(ChatMessage.created_at) == today.isoformat(),
            )
        )
        if (used_today or 0) >= settings.ai_daily_limit:
            raise HTTPException(
                status_code=429,
                detail="Дневной лимит сообщений ИИ-помощнику исчерпан.",
            )
        reply = await _provider_reply(prompt, payload.history, snapshot, previous, currency)
    else:
        reply = _local_reply(prompt, snapshot, previous, currency)

    user_message = ChatMessage(user_id=user.id, role="user", content=prompt)
    assistant_message = ChatMessage(user_id=user.id, role="assistant", content=reply)
    db.add_all([user_message, assistant_message])
    db.commit()
    db.refresh(user_message)
    db.refresh(assistant_message)
    return {
        "user_message": {
            "id": user_message.id,
            "role": user_message.role,
            "content": user_message.content,
            "created_at": user_message.created_at,
        },
        "assistant_message": {
            "id": assistant_message.id,
            "role": assistant_message.role,
            "content": assistant_message.content,
            "created_at": assistant_message.created_at,
        },
        "ai_enabled": configured_ai_provider() is not None,
        "ai_provider": configured_ai_provider(),
    }
