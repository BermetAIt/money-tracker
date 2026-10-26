from fastapi.testclient import TestClient

from tests.conftest import register_user


def test_register_and_me(client: TestClient) -> None:
    tokens = register_user(client)
    assert "access_token" in tokens
    assert client.cookies.get("refresh_token")
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "anna@example.com"
    assert body["initials"] == "АК"
    assert body["currency"] == "KGS"


def test_register_respects_remember_me(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Анна",
            "email": "anna@example.com",
            "password": "StrongPass1",
            "remember_me": False,
        },
    )
    assert response.status_code == 201
    assert "Max-Age" not in response.headers["set-cookie"]


def test_duplicate_email(client: TestClient) -> None:
    register_user(client)
    again = client.post(
        "/api/auth/register",
        json={
            "name": "Другая",
            "email": "Anna@example.com",
            "password": "AnotherPass1",
        },
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "conflict"


def test_login_logout_refresh(client: TestClient) -> None:
    register_user(client)
    login = client.post(
        "/api/auth/login",
        json={"email": "anna@example.com", "password": "StrongPass1", "remember_me": True},
    )
    assert login.status_code == 200
    refresh = client.post("/api/auth/refresh")
    assert refresh.status_code == 200
    assert "access_token" in refresh.json()
    logout = client.post("/api/auth/logout")
    assert logout.status_code == 204
    denied = client.post("/api/auth/refresh")
    assert denied.status_code == 401


def test_wrong_password(client: TestClient) -> None:
    register_user(client)
    response = client.post(
        "/api/auth/login",
        json={"email": "anna@example.com", "password": "wrong-pass"},
    )
    assert response.status_code == 401


def test_protected_without_token(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_validation_error_format(client: TestClient) -> None:
    response = client.post("/api/auth/register", json={"name": "A", "email": "bad", "password": "1"})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "details" in body["error"]
