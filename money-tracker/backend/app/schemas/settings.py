from typing import Literal

from app.schemas.auth import ALLOWED_CURRENCIES
from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserSettingsUpdate(BaseModel):
    theme: Literal["light", "dark", "system"] | None = None
    accent_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    currency: str | None = None
    notifications_email: bool | None = None
    notifications_push: bool | None = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        code = value.upper()
        if code not in ALLOWED_CURRENCIES:
            raise ValueError("Неподдерживаемая валюта")
        return code


class UserSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    theme: str
    accent_color: str
    currency: str
    notifications_email: bool
    notifications_push: bool
