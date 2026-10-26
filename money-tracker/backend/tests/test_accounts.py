from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import register_user


def auth(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_create_account_uses_users_currency_and_is_private(client: TestClient) -> None:
    owner = register_user(client)
    created = client.post(
        "/api/accounts",
        headers=auth(owner),
        json={"name": "Наличные", "type": "cash"},
    )
    assert created.status_code == 201
    assert created.json()["name"] == "Наличные"
    assert created.json()["type"] == "cash"
    assert created.json()["currency"] == "KGS"
    assert created.json()["balance_minor"] == 0

    another_user = register_user(client, email="other@example.com")
    owner_accounts = client.get("/api/accounts", headers=auth(owner)).json()
    other_accounts = client.get("/api/accounts", headers=auth(another_user)).json()
    assert any(account["id"] == created.json()["id"] for account in owner_accounts)
    assert all(account["id"] != created.json()["id"] for account in other_accounts)


def test_create_account_rejects_invalid_type_and_blank_name(client: TestClient) -> None:
    tokens = register_user(client)
    invalid_type = client.post(
        "/api/accounts",
        headers=auth(tokens),
        json={"name": "Накопления", "type": "unknown"},
    )
    blank_name = client.post(
        "/api/accounts",
        headers=auth(tokens),
        json={"name": "   ", "type": "savings"},
    )
    assert invalid_type.status_code == 422
    assert blank_name.status_code == 422


def test_transfer_between_accounts_updates_both_balances(client: TestClient) -> None:
    tokens = register_user(client)
    headers = auth(tokens)
    source = client.get("/api/accounts", headers=headers).json()[0]
    destination = client.post(
        "/api/accounts",
        headers=headers,
        json={"name": "Накопления", "type": "savings"},
    ).json()
    amount_minor = 275_000
    occurred_on = date.today()

    transfer = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": source["id"],
            "to_account_id": destination["id"],
            "type": "transfer",
            "amount_minor": amount_minor,
            "occurred_on": occurred_on.isoformat(),
            "title": "Перевод между счетами",
        },
    )
    assert transfer.status_code == 201

    updated = client.get("/api/accounts", headers=headers).json()
    source_balance = next(
        account["balance_minor"] for account in updated if account["id"] == source["id"]
    )
    destination_balance = next(
        account["balance_minor"] for account in updated if account["id"] == destination["id"]
    )
    assert source_balance == -amount_minor
    assert destination_balance == amount_minor
