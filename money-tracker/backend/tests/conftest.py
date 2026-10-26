import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DATABASE_URL", "sqlite://")

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import entities  # noqa: F401, E402

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite://")

if TEST_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)

TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def _db() -> Generator[Session, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(_db: Session) -> Generator[TestClient, None, None]:
    def override_db():
        try:
            yield _db
        finally:
            pass

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def register_user(client: TestClient, email: str = "anna@example.com", name: str = "Анна Кузнецова") -> dict:
    response = client.post(
        "/api/auth/register",
        json={
            "name": name,
            "email": email,
            "password": "StrongPass1",
            "currency": "KGS",
            "monthly_income_minor": 12000000,
            "monthly_limit_minor": 6000000,
            "goal_name": "Подушка",
            "goal_target_minor": 10000000,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()
