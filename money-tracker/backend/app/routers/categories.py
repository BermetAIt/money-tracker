from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Category, User
from app.schemas.finance import CategoryOut
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: str = Field(pattern="^(expense|income)$")
    color: str = Field(default="#6D5DFB", max_length=16)
    icon: str = Field(default="bag", max_length=32)


@router.get("", response_model=list[CategoryOut])
def list_categories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Category).where(Category.user_id == user.id).order_by(Category.id)).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.scalar(
        select(Category).where(Category.user_id == user.id, Category.name == payload.name)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Категория уже есть")
    category = Category(user_id=user.id, is_system=False, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category
