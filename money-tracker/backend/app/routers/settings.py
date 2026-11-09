from app.database import get_db
from app.deps import get_current_user
from app.models import User, UserSettings
from app.schemas.settings import UserSettingsOut, UserSettingsUpdate
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _settings_for_user(db: Session, user: User) -> UserSettings:
    if user.settings is None:
        user.settings = UserSettings(user_id=user.id)
        db.add(user.settings)
        db.flush()
    return user.settings


@router.get("", response_model=UserSettingsOut)
def get_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    settings = _settings_for_user(db, user)
    db.commit()
    db.refresh(settings)
    return settings


@router.patch("", response_model=UserSettingsOut)
def update_settings(
    payload: UserSettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = _settings_for_user(db, user)
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if value is not None:
            setattr(settings, field, value.upper() if field == "currency" else value)
    db.commit()
    db.refresh(settings)
    return settings
