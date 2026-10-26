from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Session as AuthSession
from app.models import User, UserSettings
from app.schemas.auth import LoginIn, RegisterIn, TokenOut, UserOut
from app.security import (
    REFRESH_COOKIE,
    create_access_token,
    hash_password,
    hash_token,
    new_refresh_token,
    verify_password,
)
from app.services.onboarding import provision_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _initials(name: str) -> str:
    parts = [part for part in name.split() if part]
    if not parts:
        return "MT"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def user_out(user: User) -> UserOut:
    currency = user.settings.currency if user.settings else "KGS"
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        currency=currency,
        initials=_initials(user.name),
    )


def set_refresh_cookie(response: Response, token: str, remember: bool) -> None:
    max_age = settings.refresh_token_expire_days * 24 * 60 * 60 if remember else None
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=max_age,
        path="/api/auth",
    )


def issue_session(
    db: Session,
    response: Response,
    user: User,
    request: Request,
    remember: bool,
) -> TokenOut:
    raw = new_refresh_token()
    expires = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_token(raw),
            user_agent=(request.headers.get("user-agent") or "")[:255],
            ip=request.client.host if request.client else "",
            remember=remember,
            expires_at=expires,
        )
    )
    db.commit()
    set_refresh_cookie(response, raw, remember)
    return TokenOut(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Эта почта уже зарегистрирована")
    user = User(name=payload.name, email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    provision_user(
        db,
        user,
        currency=payload.currency,
        monthly_income_minor=payload.monthly_income_minor,
        monthly_limit_minor=payload.monthly_limit_minor,
        goal_name=payload.goal_name,
        goal_target_minor=payload.goal_target_minor,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Эта почта уже зарегистрирована")
    db.refresh(user)
    return issue_session(db, response, user, request, remember=payload.remember_me)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная почта или пароль")
    return issue_session(db, response, user, request, payload.remember_me)


@router.post("/refresh", response_model=TokenOut)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Нет сеанса")
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(raw)))
    now = datetime.now(UTC)
    if session is None or session.expires_at < now:
        response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сеанс истек")
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
    session.last_used_at = now
    db.commit()
    return TokenOut(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(raw)))
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.settings is None:
        user.settings = db.get(UserSettings, user.id)
    return user_out(user)
