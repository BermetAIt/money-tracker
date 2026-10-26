from datetime import date

from app.routers import assistant as assistant_router
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


def test_assistant_uses_openai_when_configured(client: TestClient, monkeypatch) -> None:
    requests = []
    monkeypatch.setattr(assistant_router.settings, "openai_api_key", "test-key")

    class FakeResponse:
        def raise_for_status(self) -> None:
            pass

        def json(self) -> dict:
            return {"choices": [{"message": {"content": "Ответ OpenAI"}}]}

    class FakeClient:
        def __init__(self, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            pass

        async def post(self, url: str, *, headers: dict, json: dict) -> FakeResponse:
            requests.append({"url": url, "headers": headers, "json": json})
            return FakeResponse()

    monkeypatch.setattr(assistant_router.httpx, "AsyncClient", FakeClient)
    tokens = register_user(client)
    response = client.post(
        "/api/assistant/messages",
        headers=auth(tokens),
        json={
            "content": "Какой бюджет остался?",
            "history": [{"role": "user", "content": "Привет"}],
        },
    )

    assert response.status_code == 201
    assert response.json()["ai_enabled"] is True
    assert response.json()["ai_provider"] == "OpenAI"
    assert response.json()["assistant_message"]["content"] == "Ответ OpenAI"
    assert len(requests) == 1
    assert requests[0]["url"] == "https://api.openai.com/v1/chat/completions"
    assert requests[0]["headers"]["Authorization"] == "Bearer test-key"
    assert requests[0]["json"]["model"] == "gpt-4o-mini"
    assert requests[0]["json"]["messages"][-2:] == [
        {"role": "user", "content": "Привет"},
        {"role": "user", "content": "Какой бюджет остался?"},
    ]


def test_assistant_uses_groq_endpoint_and_model(client: TestClient, monkeypatch) -> None:
    requests = []
    monkeypatch.setattr(assistant_router.settings, "groq_api_key", "test-groq-key")
    monkeypatch.setattr(assistant_router.settings, "groq_model", "openai/gpt-oss-20b")

    class FakeResponse:
        def raise_for_status(self) -> None:
            pass

        def json(self) -> dict:
            return {"choices": [{"message": {"content": "Ответ Groq"}}]}

    class FakeClient:
        def __init__(self, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            pass

        async def post(self, url: str, *, headers: dict, json: dict) -> FakeResponse:
            requests.append({"url": url, "headers": headers, "json": json})
            return FakeResponse()

    monkeypatch.setattr(assistant_router.httpx, "AsyncClient", FakeClient)
    tokens = register_user(client)
    response = client.post(
        "/api/assistant/messages",
        headers=auth(tokens),
        json={"content": "Сколько потрачено?"},
    )

    assert response.status_code == 201
    assert response.json()["ai_enabled"] is True
    assert response.json()["ai_provider"] == "Groq"
    assert response.json()["assistant_message"]["content"] == "Ответ Groq"
    assert requests[0]["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert requests[0]["headers"]["Authorization"] == "Bearer test-groq-key"
    assert requests[0]["json"]["model"] == "openai/gpt-oss-20b"
