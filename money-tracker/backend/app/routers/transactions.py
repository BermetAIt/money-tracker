from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import Account, Category, Transaction, User
from app.schemas.finance import TransactionIn, TransactionOut
from app.services.finance import serialize_transaction

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _owned_account(db: Session, user_id: int, account_id: int) -> Account:
    account = db.scalar(select(Account).where(Account.id == account_id, Account.user_id == user_id))
    if account is None:
        raise HTTPException(status_code=404, detail="Счёт не найден")
    return account


def _owned_category(db: Session, user_id: int, category_id: int | None) -> Category | None:
    if category_id is None:
        return None
    category = db.scalar(select(Category).where(Category.id == category_id, Category.user_id == user_id))
    if category is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    return category


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    type: str | None = Query(default=None, pattern="^(expense|income|transfer)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.account))
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.occurred_on.desc(), Transaction.id.desc())
    )
    if month:
        year, mon = (int(part) for part in month.split("-"))
        start = date(year, mon, 1)
        if mon == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, mon + 1, 1)
        stmt = stmt.where(Transaction.occurred_on >= start, Transaction.occurred_on < end)
    if type:
        stmt = stmt.where(Transaction.type == type)
    return [serialize_transaction(tx) for tx in db.scalars(stmt).unique()]


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(
    payload: TransactionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _owned_account(db, user.id, payload.account_id)
    if payload.type == "transfer":
        if payload.to_account_id is None:
            raise HTTPException(status_code=422, detail="Для перевода укажите второй счёт")
        _owned_account(db, user.id, payload.to_account_id)
        if payload.to_account_id == payload.account_id:
            raise HTTPException(status_code=422, detail="Нельзя перевести на тот же счёт")
    else:
        _owned_category(db, user.id, payload.category_id)
    tx = Transaction(user_id=user.id, **payload.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    tx = db.scalar(
        select(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.account))
        .where(Transaction.id == tx.id, Transaction.user_id == user.id)
    )
    return serialize_transaction(tx)


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(
    tx_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tx = db.scalar(select(Transaction).where(Transaction.id == tx_id, Transaction.user_id == user.id))
    if tx is None:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    db.delete(tx)
    db.commit()
