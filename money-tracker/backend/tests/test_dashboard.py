from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import register_user


def auth(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def seed_october(client: TestClient, tokens: dict) -> None:
    accounts = client.get("/api/accounts", headers=auth(tokens)).json()
    cats = {item["name"]: item["id"] for item in client.get("/api/categories", headers=auth(tokens)).json()}
    account_id = accounts[0]["id"]
    rows = [
        ("income", "Зарплата", "Зарплата", 12000000, "2026-10-10"),
        ("expense", "Продукты", "Перекрёсток", 245000, "2026-10-12"),
        ("expense", "Кафе и рестораны", "Кофемания", 85000, "2026-10-12"),
        ("expense", "Транспорт", "Яндекс Go", 60000, "2026-10-11"),
        ("expense", "Продукты", "ВкусВилл", 140000, "2026-10-11"),
        ("expense", "Жильё", "Аренда", 2400000, "2026-10-01"),
        ("expense", "Подписки", "Подписки", 240000, "2026-10-03"),
        ("expense", "Продукты", "Продукты", 875000, "2026-10-05"),
        ("expense", "Кафе и рестораны", "Кафе", 515000, "2026-10-07"),
        ("expense", "Транспорт", "Транспорт", 300000, "2026-10-08"),
        ("income", "Зарплата", "Остаток на начало", 9000000, "2026-09-30"),
    ]
    for kind, cat, title, amount, day in rows:
        payload = {
            "account_id": account_id,
            "category_id": cats[cat],
            "type": kind,
            "amount_minor": amount,
            "occurred_on": day,
            "title": title,
        }
        assert client.post("/api/transactions", headers=auth(tokens), json=payload).status_code == 201
    assert (
        client.put(
            "/api/budgets",
            headers=auth(tokens),
            json={"category_id": None, "year": 2026, "month": 10, "limit_minor": 6000000},
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/budgets",
            headers=auth(tokens),
            json={"category_id": cats["Продукты"], "year": 2026, "month": 10, "limit_minor": 1500000},
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/budgets",
            headers=auth(tokens),
            json={"category_id": cats["Кафе и рестораны"], "year": 2026, "month": 10, "limit_minor": 800000},
        ).status_code
        == 200
    )


def test_dashboard_numbers(client: TestClient) -> None:
    tokens = register_user(client)
    seed_october(client, tokens)
    dash = client.get("/api/dashboard?month=2026-10", headers=auth(tokens)).json()
    assert dash["income_minor"] == 12000000
    assert dash["expense_minor"] == 4860000
    assert dash["month_start_balance_minor"] == 9000000
    assert dash["balance_minor"] == 9000000 + 12000000 - 4860000
    assert dash["category_count"] == 5
    assert dash["recent"][0]["title"] == "Перекрёсток"
    assert dash["budget"]["limit_minor"] == 6000000
    housing = next(item for item in dash["categories"] if item["name"] == "Жильё")
    assert housing["amount_minor"] == 2400000
    assert housing["percent"] == 49.4


def test_new_user_empty_dashboard(client: TestClient) -> None:
    tokens = register_user(client, email="new@example.com")
    dash = client.get("/api/dashboard?month=2026-10", headers=auth(tokens)).json()
    assert dash["balance_minor"] == 0
    assert dash["recent"] == []
    assert dash["categories"] == []
