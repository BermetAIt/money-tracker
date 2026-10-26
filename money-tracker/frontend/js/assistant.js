import { apiJson } from "./api.js";
import { formatMoney, monthTitle, symbol } from "./format.js";
import { icon } from "./icons.js";
import { bootShell, pageRoot } from "./layout.js";

const SUGGESTIONS = [
  "Где можно сэкономить?",
  "Уложусь ли я в бюджет?",
  "Покажи крупные траты",
  "Сколько уже ушло на еду?",
];
const CAPABILITIES = [
  ["ana", "Считать траты", "По категориям, дням и счетам"],
  ["bud", "Следить за бюджетом", "Скажу, сколько можно тратить в день"],
  ["idea", "Искать, где сэкономить", "Подскажу самые большие расходы"],
  ["ops", "Сравнивать месяцы", "Что выросло и что стало меньше"],
];

let currency = "KGS";
let dashboard = null;
let history = [];
let currentMessages = [];
let sending = false;
let aiEnabled = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function render() {
  const [year, month] = currentMonthKey().split("-").map(Number);
  const budget = dashboard.budget;
  const percent = budget.limit_minor ? Math.round((budget.spent_minor / budget.limit_minor) * 100) : 0;
  const progress = Math.min(percent, 100);
  const label = dashboard.month_label || monthTitle(year, month);
  pageRoot().innerHTML = `
    <div class="assistant-page">
      <header class="page-head assistant-head">
        <div><h1>ИИ-помощник</h1><p>Спросите о своих финансах обычными словами.</p></div>
        <button class="primary addbtn assistant-new-chat" id="assistant-new-chat" type="button">${icon("plus")}Новый чат</button>
      </header>
      <div class="assistant-layout">
        <section class="card assistant-chat" aria-label="Чат с финансовым помощником">
          <div class="assistant-chat-heading">
            <span class="assistant-avatar">${icon("ai")}</span>
            <span><strong>Помощник Money Tracker</strong><small id="assistant-mode"></small></span>
            <span class="assistant-online" aria-label="Помощник готов к работе"></span>
          </div>
          <div class="assistant-messages" id="assistant-messages" aria-live="polite"></div>
          <div class="assistant-suggestions" id="assistant-suggestions"></div>
          <form class="assistant-compose" id="assistant-form">
            <label class="sr-only" for="assistant-input">Ваш вопрос</label>
            <textarea id="assistant-input" maxlength="1200" rows="1" placeholder="Спросите, например: сколько осталось до конца месяца?" required></textarea>
            <button class="assistant-send" id="assistant-send" type="submit" aria-label="Отправить вопрос">${icon("arrow")}</button>
          </form>
          <div class="assistant-compose-note">Ответы основаны на ваших данных в приложении.</div>
        </section>
        <aside class="assistant-sidebar">
          <section class="assistant-budget-card">
            <span>Главное за ${escapeHtml(label)}</span>
            <strong>${budget.limit_minor ? `${percent}% бюджета` : "Бюджет не задан"}</strong>
            <small>${
              budget.limit_minor
                ? percent >= 100
                  ? `Лимит превышен на ${formatMoney(budget.spent_minor - budget.limit_minor, currency)}.`
                  : `Осталось ${formatMoney(budget.remaining_minor, currency)} на этот месяц.`
                : `Расходы за месяц: ${formatMoney(dashboard.expense_minor, currency)}.`
            }</small>
            <div class="assistant-budget-track"><span style="width:${progress}%"></span></div>
            <div class="assistant-budget-foot"><span>${formatMoney(budget.spent_minor, currency)} потрачено</span><span>${budget.limit_minor ? formatMoney(budget.limit_minor, currency) : "Лимит не задан"}</span></div>
          </section>
          <section class="card assistant-capabilities">
            <h2>Что я умею</h2>
            ${CAPABILITIES.map(
              ([iconName, title, description]) => `
                <div class="assistant-capability">
                  <span>${icon(iconName)}</span><span><strong>${title}</strong><small>${description}</small></span>
                </div>`,
            ).join("")}
          </section>
          <section class="card assistant-history">
            <h2>История чатов <a href="/operations">Операции</a></h2>
            <div class="assistant-history-list" id="assistant-history-list"></div>
          </section>
        </aside>
      </div>
    </div>`;

  document.getElementById("assistant-mode").textContent = aiEnabled
    ? "ИИ подключён · данные используются только для ответа на ваш запрос"
    : "Локальные финансовые подсказки · ИИ-ключ не подключён";
  renderMessages();
  renderSuggestions();
  renderHistory();
  document.getElementById("assistant-form").addEventListener("submit", sendMessage);
  document.getElementById("assistant-new-chat").addEventListener("click", () => {
    currentMessages = [];
    renderMessages();
    renderSuggestions();
    document.getElementById("assistant-input").focus();
  });
  document.getElementById("assistant-input").addEventListener("input", resizeInput);
}

function renderMessages() {
  const root = document.getElementById("assistant-messages");
  root.replaceChildren();
  if (!currentMessages.length) {
    appendMessage(root, "assistant", "Привет! Я помогу разобраться в ваших тратах. Что вас интересует?");
    return;
  }
  for (const message of currentMessages) appendMessage(root, message.role, message.content);
  root.scrollTop = root.scrollHeight;
}

function appendMessage(root, role, content) {
  const row = document.createElement("div");
  row.className = `assistant-message-row ${role}`;
  if (role === "assistant") {
    const avatar = document.createElement("span");
    avatar.className = "assistant-message-avatar";
    avatar.innerHTML = icon("ai");
    row.append(avatar);
  }
  const bubble = document.createElement("div");
  bubble.className = "assistant-bubble";
  bubble.textContent = content;
  row.append(bubble);
  root.append(row);
  return row;
}

function renderSuggestions() {
  const root = document.getElementById("assistant-suggestions");
  root.replaceChildren();
  if (currentMessages.length) return;
  for (const prompt of SUGGESTIONS) {
    const button = document.createElement("button");
    button.className = "assistant-suggestion";
    button.type = "button";
    button.textContent = prompt;
    button.addEventListener("click", () => submitPrompt(prompt));
    root.append(button);
  }
}

function renderHistory() {
  const root = document.getElementById("assistant-history-list");
  const pairs = [];
  for (let index = 0; index < history.length; index += 1) {
    const message = history[index];
    if (message.role !== "user") continue;
    const reply = history.slice(index + 1).find((item) => item.role === "assistant");
    if (reply) pairs.push({ question: message, reply });
  }
  const recent = pairs.slice(-4).reverse();
  if (!recent.length) {
    root.innerHTML = `<p class="assistant-history-empty">Здесь появятся ваши вопросы и ответы.</p>`;
    return;
  }
  root.innerHTML = recent
    .map(
      ({ question, reply }, index) => `
        <button type="button" class="assistant-history-item" data-history-index="${index}">
          <span class="assistant-history-dot"></span><span><strong>${escapeHtml(question.content)}</strong><small>${formatHistoryDate(question.created_at)}</small></span>
        </button>`,
    )
    .join("");
  root.querySelectorAll("[data-history-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const pair = recent[Number(button.dataset.historyIndex)];
      currentMessages = [
        { role: "user", content: pair.question.content },
        { role: "assistant", content: pair.reply.content },
      ];
      renderMessages();
      renderSuggestions();
    });
  });
}

function formatHistoryDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

function resizeInput(event) {
  const input = event.currentTarget;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

async function submitPrompt(prompt) {
  const input = document.getElementById("assistant-input");
  input.value = prompt;
  await sendMessage({ preventDefault() {} });
}

async function sendMessage(event) {
  event.preventDefault();
  if (sending) return;
  const input = document.getElementById("assistant-input");
  const prompt = input.value.trim();
  if (!prompt) return;

  const previousMessages = currentMessages.slice(-12);
  currentMessages.push({ role: "user", content: prompt });
  const messageRoot = document.getElementById("assistant-messages");
  const submittedRow = appendMessage(messageRoot, "user", prompt);
  input.value = "";
  input.style.height = "auto";
  document.getElementById("assistant-suggestions").replaceChildren();
  sending = true;
  setSending(true);
  const typing = document.createElement("div");
  typing.className = "assistant-typing";
  typing.textContent = "Помощник готовит ответ…";
  messageRoot.append(typing);
  messageRoot.scrollTop = messageRoot.scrollHeight;

  try {
    const result = await apiJson("/api/assistant/messages", {
      method: "POST",
      body: JSON.stringify({ content: prompt, history: previousMessages }),
    });
    typing.remove();
    currentMessages.push({ role: "assistant", content: result.assistant_message.content });
    appendMessage(messageRoot, "assistant", result.assistant_message.content);
    aiEnabled = result.ai_enabled;
    history.push(result.user_message, result.assistant_message);
    renderHistory();
    document.getElementById("assistant-mode").textContent = aiEnabled
      ? "ИИ подключён · данные используются только для ответа на ваш запрос"
      : "Локальные финансовые подсказки · ИИ-ключ не подключён";
  } catch (error) {
    typing.remove();
    const errorMessage = document.createElement("p");
    errorMessage.className = "assistant-request-error";
    errorMessage.textContent = error.message || "Не удалось отправить вопрос. Попробуйте ещё раз.";
    messageRoot.append(errorMessage);
    submittedRow.remove();
    currentMessages.pop();
    input.value = prompt;
  } finally {
    sending = false;
    setSending(false);
    input.focus();
    messageRoot.scrollTop = messageRoot.scrollHeight;
  }
}

function setSending(value) {
  const input = document.getElementById("assistant-input");
  const send = document.getElementById("assistant-send");
  input.disabled = value;
  send.disabled = value;
  send.setAttribute("aria-busy", String(value));
}

async function loadData() {
  const month = currentMonthKey();
  const [me, dashboardData, messages] = await Promise.all([
    apiJson("/api/auth/me"),
    apiJson(`/api/dashboard?month=${month}`),
    apiJson("/api/assistant/messages?limit=80"),
  ]);
  currency = me.currency || "KGS";
  dashboard = dashboardData;
  history = messages.messages || [];
  aiEnabled = messages.ai_enabled;
}

const me = await bootShell("ai");
if (me) {
  pageRoot().innerHTML = `<div class="card skel" style="height:180px"></div>`;
  try {
    currency = me.currency || "KGS";
    await loadData();
    render();
  } catch (error) {
    pageRoot().innerHTML = `<div class="assistant-load-error" role="alert">Не удалось загрузить помощника: ${escapeHtml(error.message || "проверьте соединение и обновите страницу.")}</div>`;
  }
}
