from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import register_user


def auth(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_assistant_answers_from_finance_data_and_saves_history(client: TestClient) -> None:
    tokens = register_user(client)
    headers = auth(tokens)
    accounts = client.get("/api/accounts", headers=headers).json()
    categories = client.get("/api/categories", headers=headers).json()
    food = next(category for category in categories if category["name"] == "Продукты")

    created = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": accounts[0]["id"],
            "category_id": food["id"],
            "type": "expense",
            "amount_minor": 250_000,
            "occurred_on": date.today().isoformat(),
            "title": "Покупки",
        },
    )
    assert created.status_code == 201

    answer = client.post(
        "/api/assistant/messages",
        headers=headers,
        json={"content": "На что я потратил больше всего?"},
    )
    assert answer.status_code == 201
    result = answer.json()
    assert result["user_message"]["content"] == "На что я потратил больше всего?"
    assert "Продукты" in result["assistant_message"]["content"]
    assert "2 500" in result["assistant_message"]["content"]

    history = client.get("/api/assistant/messages", headers=headers)
    assert history.status_code == 200
    assert [message["role"] for message in history.json()["messages"]] == ["user", "assistant"]
    assert history.json()["ai_enabled"] is False


def test_assistant_history_is_private_and_prompt_is_validated(client: TestClient) -> None:
    owner = register_user(client)
    created = client.post(
        "/api/assistant/messages",
        headers=auth(owner),
        json={"content": "Какой бюджет остался?"},
    )
    assert created.status_code == 201

    another_user = register_user(client, email="assistant@example.com")
    other_history = client.get("/api/assistant/messages", headers=auth(another_user))
    empty_prompt = client.post(
        "/api/assistant/messages",
        headers=auth(another_user),
        json={"content": "   "},
    )
    assert other_history.status_code == 200
    assert other_history.json()["messages"] == []
    assert empty_prompt.status_code == 422


def test_assistant_compares_current_and_previous_month(client: TestClient) -> None:
    tokens = register_user(client)
    headers = auth(tokens)
    account = client.get("/api/accounts", headers=headers).json()[0]
    category = next(
        item
        for item in client.get("/api/categories", headers=headers).json()
        if item["name"] == "Продукты"
    )
    today = date.today()
    previous_month = date.fromordinal(date(today.year, today.month, 1).toordinal() - 1)
    for amount, occurred_on in (
        (250_000, today),
        (100_000, previous_month),
    ):
        response = client.post(
            "/api/transactions",
            headers=headers,
            json={
                "account_id": account["id"],
                "category_id": category["id"],
                "type": "expense",
                "amount_minor": amount,
                "occurred_on": occurred_on.isoformat(),
                "title": "Покупки",
            },
        )
        assert response.status_code == 201

    response = client.post(
        "/api/assistant/messages",
        headers=headers,
        json={"content": "Сравни расходы с прошлым месяцем"},
    )
    assert response.status_code == 201
    assert "150%" in response.json()["assistant_message"]["content"]
