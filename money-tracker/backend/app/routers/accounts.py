from app.database import get_db
from app.deps import get_current_user
from app.models import Account, User, UserSettings
from app.schemas.finance import AccountIn, AccountOut
from app.services.finance import account_balance
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.post("", response_model=AccountOut, status_code=201)
def create_account(
    payload: AccountIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    account = Account(
        user_id=user.id,
        name=payload.name.strip(),
        type=payload.type,
        currency=settings.currency if settings else "KGS",
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return AccountOut.model_validate(account)


@router.get("", response_model=list[AccountOut])
def list_accounts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    accounts = db.scalars(
        select(Account).where(Account.user_id == user.id, Account.is_archived.is_(False))
    ).all()
    result = []
    for account in accounts:
        item = AccountOut.model_validate(account)
        item.balance_minor = account_balance(db, user.id, account.id)
        result.append(item)
    return result
