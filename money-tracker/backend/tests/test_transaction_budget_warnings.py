from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import register_user


def auth(tokens: dict) -> dict:
    return {"Authorization": "Bearer " + tokens["access_token"]}


def test_expense_creation_reports_exceeded_overall_and_category_budgets(
    client: TestClient,
) -> None:
    tokens = register_user(client)
    headers = auth(tokens)
    account = client.get("/api/accounts", headers=headers).json()[0]
    categories = client.get("/api/categories", headers=headers).json()
    food = next(item for item in categories if item["name"] == "Продукты")
    today = date.today()

    for category_id, limit_minor in ((None, 10_000), (food["id"], 5_000)):
        response = client.put(
            "/api/budgets",
            headers=headers,
            json={
                "category_id": category_id,
                "year": today.year,
                "month": today.month,
                "limit_minor": limit_minor,
            },
        )
        assert response.status_code == 200

    created = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "category_id": food["id"],
            "type": "expense",
            "amount_minor": 12_000,
            "occurred_on": today.isoformat(),
            "title": "Крупная покупка",
        },
    )

    assert created.status_code == 201
    warnings = created.json()["budget_warnings"]
    assert {warning["category_name"] for warning in warnings} == {None, "Продукты"}
    assert all(warning["spent_minor"] == 12_000 for warning in warnings)
    assert {warning["exceeded_minor"] for warning in warnings} == {2_000, 7_000}


def test_expense_creation_has_no_budget_warning_within_limits(client: TestClient) -> None:
    tokens = register_user(client)
    headers = auth(tokens)
    account = client.get("/api/accounts", headers=headers).json()[0]
    today = date.today()
    client.put(
        "/api/budgets",
        headers=headers,
        json={
            "category_id": None,
            "year": today.year,
            "month": today.month,
            "limit_minor": 10_000,
        },
    )

    created = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "type": "expense",
            "amount_minor": 10_000,
            "occurred_on": today.isoformat(),
            "title": "Покупка в пределах лимита",
        },
    )

    assert created.status_code == 201
    assert created.json()["budget_warnings"] == []


def test_income_creation_does_not_report_budget_warning(client: TestClient) -> None:
    tokens = register_user(client)
    headers = auth(tokens)
    account = client.get("/api/accounts", headers=headers).json()[0]
    today = date.today()
    category = next(
        item
        for item in client.get("/api/categories", headers=headers).json()
        if item["name"] == "Зарплата"
    )
    client.put(
        "/api/budgets",
        headers=headers,
        json={
            "category_id": None,
            "year": today.year,
            "month": today.month,
            "limit_minor": 1,
        },
    )

    created = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "category_id": category["id"],
            "type": "income",
            "amount_minor": 10_000,
            "occurred_on": today.isoformat(),
            "title": "Зарплата",
        },
    )

    assert created.status_code == 201
    assert created.json()["budget_warnings"] == []


def test_notifications_include_current_overall_and_category_budget_excesses(
    client: TestClient,
) -> None:
    tokens = register_user(client)
    headers = auth(tokens)
    account = client.get("/api/accounts", headers=headers).json()[0]
    categories = client.get("/api/categories", headers=headers).json()
    food = next(item for item in categories if item["name"] == "Продукты")
    today = date.today()

    for category_id, limit_minor in ((None, 10_000), (food["id"], 5_000)):
        client.put(
            "/api/budgets",
            headers=headers,
            json={
                "category_id": category_id,
                "year": today.year,
                "month": today.month,
                "limit_minor": limit_minor,
            },
        )
    client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "category_id": food["id"],
            "type": "expense",
            "amount_minor": 12_000,
            "occurred_on": today.isoformat(),
            "title": "Покупка",
        },
    )

    notifications = client.get("/api/notifications", headers=headers)

    assert notifications.status_code == 200
    assert {item["category_name"] for item in notifications.json()} == {
        None,
        "Продукты",
    }
    assert {item["exceeded_minor"] for item in notifications.json()} == {
        2_000,
        7_000,
    }
