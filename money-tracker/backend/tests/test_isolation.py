from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import register_user


def _auth(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_user_cannot_see_foreign_transactions(client: TestClient) -> None:
    anna = register_user(client, email="anna@example.com", name="Анна")
    anna_accounts = client.get("/api/accounts", headers=_auth(anna)).json()
    anna_cats = client.get("/api/categories", headers=_auth(anna)).json()
    food = next(item for item in anna_cats if item["name"] == "Продукты")
    created = client.post(
        "/api/transactions",
        headers=_auth(anna),
        json={
            "account_id": anna_accounts[0]["id"],
            "category_id": food["id"],
            "type": "expense",
            "amount_minor": 245000,
            "occurred_on": date.today().isoformat(),
            "title": "Перекрёсток",
        },
    )
    assert created.status_code == 201
    secret_id = created.json()["id"]

    boris = register_user(client, email="boris@example.com", name="Борис")
    foreign_list = client.get("/api/transactions", headers=_auth(boris)).json()
    assert foreign_list == []
    dash = client.get("/api/dashboard", headers=_auth(boris)).json()
    assert dash["expense_minor"] == 0
    assert dash["recent"] == []
    delete = client.delete(f"/api/transactions/{secret_id}", headers=_auth(boris))
    assert delete.status_code == 404
    still_there = client.get("/api/transactions", headers=_auth(anna)).json()
    assert len(still_there) == 1
    assert still_there[0]["title"] == "Перекрёсток"
