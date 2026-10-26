from pydantic import BaseModel, EmailStr, Field, field_validator

ALLOWED_CURRENCIES = {"KGS", "RUB", "USD", "EUR"}


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    remember_me: bool = True
    currency: str = "KGS"
    monthly_income_minor: int = Field(default=0, ge=0)
    monthly_limit_minor: int = Field(default=0, ge=0)
    goal_name: str = Field(default="", max_length=120)
    goal_target_minor: int = Field(default=0, ge=0)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower().strip()

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("currency")
    @classmethod
    def check_currency(cls, value: str) -> str:
        code = value.upper()
        if code not in ALLOWED_CURRENCIES:
            raise ValueError("Неподдерживаемая валюта")
        return code


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower().strip()


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    currency: str
    initials: str
