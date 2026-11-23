from fastapi.testclient import TestClient

from tests.conftest import register_user


def auth_headers(client: TestClient) -> dict[str, str]:
    token = register_user(client)["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_settings_are_saved_for_the_user(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.patch(
        "/api/settings",
        headers=headers,
        json={
            "theme": "dark",
            "accent_color": "#0E7A5F",
            "currency": "USD",
            "notifications_email": False,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "theme": "dark",
        "accent_color": "#0E7A5F",
        "currency": "USD",
        "notifications_email": False,
        "notifications_push": False,
    }


def test_settings_default_to_light_theme(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.get("/api/settings", headers=headers)

    assert response.status_code == 200
    assert response.json()["theme"] == "light"


def test_profile_can_be_updated(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.patch(
        "/api/auth/me",
        headers=headers,
        json={"name": "Анна Смирнова", "email": "anna.smirnova@example.com"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Анна Смирнова"
    assert response.json()["email"] == "anna.smirnova@example.com"


def test_settings_reject_unsupported_currency(client: TestClient) -> None:
    response = client.patch(
        "/api/settings",
        headers=auth_headers(client),
        json={"currency": "GBP"},
    )

    assert response.status_code == 422


def test_password_can_be_changed(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.post(
        "/api/auth/password",
        headers=headers,
        json={"current_password": "StrongPass1", "new_password": "NewStrongPass2"},
    )

    assert response.status_code == 204
    login = client.post(
        "/api/auth/login",
        json={"email": "anna@example.com", "password": "NewStrongPass2"},
    )
    assert login.status_code == 200


def test_account_deletion_requires_password_and_email_confirmation(client: TestClient) -> None:
    headers = auth_headers(client)
    rejected = client.request(
        "DELETE",
        "/api/auth/me",
        headers=headers,
        json={"password": "wrong", "confirmation": "anna@example.com"},
    )
    assert rejected.status_code == 400

    deleted = client.request(
        "DELETE",
        "/api/auth/me",
        headers=headers,
        json={"password": "StrongPass1", "confirmation": "anna@example.com"},
    )
    assert deleted.status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401
