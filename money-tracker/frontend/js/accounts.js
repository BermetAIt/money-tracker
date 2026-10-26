import { apiJson } from "./api.js";
import { formatDateLong, formatMoney, symbol } from "./format.js";
import { icon } from "./icons.js";
import { bootShell, pageRoot } from "./layout.js";

const ACCOUNT_TYPES = {
  card: { label: "Банковская карта", shortLabel: "Карта", icon: "acc", className: "card" },
  cash: { label: "Наличные", shortLabel: "Наличные", icon: "wallet", className: "cash" },
  deposit: { label: "Депозит", shortLabel: "Вклад", icon: "bud", className: "deposit" },
  savings: { label: "Копилка", shortLabel: "Цель", icon: "idea", className: "savings" },
};
const CARD_COLORS = ["#302c78", "#8e7cff", "#5d4bea", "#c9c5ec"];
const MONTH_NAMES = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

let accounts = [];
let transactions = [];
let currency = "KGS";
let selectedAccountId = null;
let submitting = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function accountType(account) {
  return ACCOUNT_TYPES[account.type] || ACCOUNT_TYPES.card;
}

function accountTransactions(account) {
  return transactions.filter((tx) => tx.account_id === account.id || tx.to_account_id === account.id);
}

function transactionDirection(tx, account) {
  if (tx.type === "income" || (tx.type === "transfer" && tx.to_account_id === account.id)) return "in";
  if (tx.type === "expense" || (tx.type === "transfer" && tx.account_id === account.id)) return "out";
  return "neutral";
}

function transactionLabel(tx, account) {
  if (tx.type === "transfer") {
    const otherAccountId = tx.account_id === account.id ? tx.to_account_id : tx.account_id;
    const other = accounts.find((item) => item.id === otherAccountId);
    return tx.account_id === account.id ? `Перевод на ${other?.name || "счёт"}` : `Перевод со счёта ${other?.name || ""}`;
  }
  return tx.category_name || (tx.type === "income" ? "Поступление" : "Расход");
}

function dateLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

function accountShare(account, total) {
  return total > 0 ? Math.max(0, (account.balance_minor / total) * 100) : 0;
}

function renderOverview() {
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance_minor, 0);
  const positiveTotal = accounts.reduce((sum, account) => sum + Math.max(0, account.balance_minor), 0);
  const income = transactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount_minor, 0);
  const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date());
  const segments = accounts
    .map((account, index) => {
      const color = CARD_COLORS[index % CARD_COLORS.length];
      return `<span title="${escapeHtml(account.name)}: ${formatMoney(account.balance_minor, currency)}" style="width:${accountShare(account, positiveTotal)}%;--account-color:${color}"></span>`;
    })
    .join("");

  document.getElementById("accounts-overview").innerHTML = `
    <section class="card accounts-total-card">
      <div class="accounts-total-heading"><span>Общий баланс</span><span class="accounts-total-icon">${icon("wallet")}</span></div>
      <strong class="accounts-total-value">${formatMoney(totalBalance, currency)}</strong>
      <small class="accounts-total-change">+ ${formatMoney(income, currency)} <span>доходы за ${monthLabel}</span></small>
    </section>
    <section class="card accounts-distribution" aria-label="Распределение баланса по счетам">
      <div class="accounts-distribution-bar">${segments || `<span class="accounts-bar-empty"></span>`}</div>
      <div class="accounts-legend">
        ${accounts
          .map((account, index) => {
            const percent = accountShare(account, positiveTotal);
            return `<span><i style="--account-color:${CARD_COLORS[index % CARD_COLORS.length]}"></i>${escapeHtml(account.name)}<small>${percent.toFixed(1)}%</small></span>`;
          })
          .join("")}
      </div>
    </section>`;
}

function renderAccountCards() {
  const total = accounts.reduce((sum, account) => sum + Math.max(0, account.balance_minor), 0);
  document.getElementById("accounts-list").innerHTML = accounts.length
    ? accounts
        .map((account, index) => {
          const type = accountType(account);
          const selected = account.id === selectedAccountId;
          const pct = accountShare(account, total);
          return `
            <button class="account-card ${type.className} ${selected ? "selected" : ""}" type="button" data-account-id="${account.id}" style="--account-card-color:${CARD_COLORS[index % CARD_COLORS.length]}" aria-pressed="${selected}">
              <span class="account-card-top">
                <span class="account-card-icon">${icon(type.icon)}</span>
                <strong>${escapeHtml(account.name)}</strong>
                <span class="account-card-badge">${type.shortLabel}</span>
              </span>
              <span class="account-card-bottom">
                <strong>${formatMoney(account.balance_minor, currency)}</strong>
                <small>${type.label}${account.goal_amount_minor ? ` · цель ${formatMoney(account.goal_amount_minor, currency)}` : pct ? ` · ${pct.toFixed(1)}% баланса` : ""}</small>
              </span>
            </button>`;
        })
        .join("")
    : `<div class="accounts-empty card"><span>${icon("wallet")}</span><strong>Пока нет счетов</strong><small>Создайте счёт, чтобы следить за балансом.</small><button class="primary addbtn" type="button" data-open-new-account>${icon("plus")}Создать счёт</button></div>`;

  document.querySelectorAll("[data-account-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedAccountId = Number(button.dataset.accountId);
      renderAccountCards();
      renderAccountDetails();
    });
  });
}

function renderAccountDetails() {
  const account = accounts.find((item) => item.id === selectedAccountId) || accounts[0];
  const root = document.getElementById("account-details");
  if (!account) {
    root.innerHTML = `<div class="account-details-empty"><span>${icon("acc")}</span><strong>Выберите счёт</strong><small>Здесь появится его баланс и последние операции.</small></div>`;
    return;
  }
  const type = accountType(account);
  const allItems = accountTransactions(account);
  const items = allItems.slice(0, 5);
  const income = allItems
    .filter((tx) => transactionDirection(tx, account) === "in")
    .reduce((sum, tx) => sum + tx.amount_minor, 0);
  const expense = allItems
    .filter((tx) => transactionDirection(tx, account) === "out")
    .reduce((sum, tx) => sum + tx.amount_minor, 0);

  root.innerHTML = `
    <div class="account-details-head">
      <span class="account-details-icon ${type.className}">${icon(type.icon)}</span>
      <span><strong>${escapeHtml(account.name)}</strong><small>${type.label} · ${account.currency}</small></span>
    </div>
    <strong class="account-details-balance">${formatMoney(account.balance_minor, currency)}</strong>
    <div class="account-details-stats">
      <div><small>Поступления</small><strong>${formatMoney(income, currency)}</strong></div>
      <div><small>Расходы</small><strong>${formatMoney(expense, currency)}</strong></div>
    </div>
    <div class="account-details-actions">
      <button class="primary addbtn" type="button" data-open-transfer>${icon("plus")}Перевести</button>
      <a class="ghost btn2" href="/operations">${icon("ops")}Операции</a>
    </div>
    <div class="account-recent-head"><strong>Последние операции</strong><a href="/operations">Все</a></div>
    <div class="account-recent-list">
      ${
        items.length
          ? items
              .map((tx) => {
                const direction = transactionDirection(tx, account);
                const label = transactionLabel(tx, account);
                const sign = direction === "in" ? "+" : direction === "out" ? "−" : "";
                return `
                  <div class="account-transaction">
                    <span class="account-transaction-icon ${direction}">${icon(tx.type === "transfer" ? "loop" : tx.type === "income" ? "income" : "bag")}</span>
                    <span class="account-transaction-copy"><strong>${escapeHtml(tx.title)}</strong><small>${escapeHtml(label)} · ${dateLabel(tx.occurred_on)}</small></span>
                    <strong class="account-transaction-amount ${direction}">${sign}${formatMoney(tx.amount_minor, currency)}</strong>
                  </div>`;
              })
              .join("")
          : `<div class="account-transactions-empty">Операций пока нет. Добавьте первую на странице <a href="/operations">«Операции»</a>.</div>`
      }
    </div>`;
  root.querySelector("[data-open-transfer]")?.addEventListener("click", openTransferModal);
}

function render() {
  pageRoot().innerHTML = `
    <div class="accounts-page">
      <header class="page-head accounts-head">
        <div><h1>Счета</h1><p>Где лежат ваши деньги. Нажмите на карточку, чтобы увидеть детали.</p></div>
        <div class="head-actions">
          <button class="ghost btn2" id="accounts-transfer" type="button">${icon("ops")}Перевод между счетами</button>
          <button class="primary addbtn" id="accounts-new" type="button">${icon("plus")}Новый счёт</button>
        </div>
      </header>
      <section class="accounts-overview" id="accounts-overview"></section>
      <div class="accounts-layout">
        <div class="accounts-left">
          <section class="accounts-list" id="accounts-list" aria-label="Список счетов"></section>
          <button class="account-add-card" type="button" data-open-new-account><span>${icon("plus")}</span><strong>Добавить счёт</strong><small>Карта, наличные, депозит или копилка</small></button>
        </div>
        <aside class="card account-details" id="account-details" aria-label="Детали выбранного счёта"></aside>
      </div>
      <div class="accounts-error" id="accounts-error" role="alert" hidden></div>
      <div class="account-modal-back" id="account-modal" hidden>
        <form class="account-modal" id="account-form">
          <h2>Новый счёт</h2><p>Добавьте счёт, чтобы видеть его баланс и операции.</p>
          <label class="account-form-field">Название<input name="name" maxlength="80" required placeholder="Например, Наличные"></label>
          <label class="account-form-field">Тип счёта<select name="type" required>
            <option value="card">Банковская карта</option><option value="cash">Наличные</option><option value="deposit">Депозит</option><option value="savings">Копилка</option>
          </select></label>
          <p class="account-form-error" id="account-form-error" role="alert"></p>
          <div class="account-modal-actions"><button class="ghost btn2" type="button" data-close-modal>Отмена</button><button class="primary addbtn" type="submit">Создать счёт</button></div>
        </form>
      </div>
      <div class="account-modal-back" id="transfer-modal" hidden>
        <form class="account-modal" id="transfer-form">
          <h2>Перевод между счетами</h2><p>Переведите деньги на другой свой счёт.</p>
          <label class="account-form-field">Откуда<select name="from" required></select></label>
          <label class="account-form-field">Куда<select name="to" required></select></label>
          <label class="account-form-field">Сумма (${symbol(currency)})<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0"></label>
          <label class="account-form-field">Дата<input name="date" type="date" required></label>
          <p class="account-form-error" id="transfer-form-error" role="alert"></p>
          <div class="account-modal-actions"><button class="ghost btn2" type="button" data-close-modal>Отмена</button><button class="primary addbtn" type="submit">Перевести</button></div>
        </form>
      </div>
    </div>`;
  renderOverview();
  renderAccountCards();
  renderAccountDetails();
  document.getElementById("accounts-new").addEventListener("click", openAccountModal);
  document.getElementById("accounts-transfer").addEventListener("click", openTransferModal);
  document.querySelectorAll("[data-open-new-account]").forEach((button) => button.addEventListener("click", openAccountModal));
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".account-modal-back").forEach((modal) => { modal.hidden = true; });
  }));
  document.querySelectorAll(".account-modal-back").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  });
  document.getElementById("account-form").addEventListener("submit", createAccount);
  document.getElementById("transfer-form").addEventListener("submit", transferMoney);
}

function openAccountModal() {
  const form = document.getElementById("account-form");
  form.reset();
  document.getElementById("account-form-error").textContent = "";
  document.getElementById("account-modal").hidden = false;
  form.elements.name.focus();
}

function openTransferModal() {
  if (accounts.length < 2) {
    showError("Для перевода создайте ещё один счёт.");
    return;
  }
  const form = document.getElementById("transfer-form");
  const options = accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.name)} · ${formatMoney(account.balance_minor, currency)}</option>`).join("");
  form.elements.from.innerHTML = options;
  form.elements.to.innerHTML = options;
  const initialFrom = accounts.some((account) => account.id === selectedAccountId) ? selectedAccountId : accounts[0].id;
  form.elements.from.value = String(initialFrom);
  form.elements.to.value = String(accounts.find((account) => account.id !== initialFrom).id);
  form.elements.date.value = localDateValue();
  form.elements.from.onchange = () => {
    if (form.elements.to.value === form.elements.from.value) {
      form.elements.to.value = String(accounts.find((account) => String(account.id) !== form.elements.from.value)?.id || "");
    }
  };
  document.getElementById("transfer-form-error").textContent = "";
  document.getElementById("transfer-modal").hidden = false;
}

async function createAccount(event) {
  event.preventDefault();
  if (submitting) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const error = document.getElementById("account-form-error");
  const name = form.elements.name.value.trim();
  if (!name) {
    error.textContent = "Введите название счёта.";
    form.elements.name.focus();
    return;
  }
  submitting = true;
  button.disabled = true;
  error.textContent = "";
  try {
    const account = await apiJson("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name, type: form.elements.type.value }),
    });
    await loadData();
    selectedAccountId = account.id;
    render();
  } catch (requestError) {
    error.textContent = requestError.message || "Не удалось создать счёт. Попробуйте ещё раз.";
  } finally {
    submitting = false;
    button.disabled = false;
  }
}

async function transferMoney(event) {
  event.preventDefault();
  if (submitting) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const error = document.getElementById("transfer-form-error");
  const amount = Number(String(form.elements.amount.value).trim().replace(",", "."));
  const from = Number(form.elements.from.value);
  const to = Number(form.elements.to.value);
  if (!Number.isFinite(amount) || amount <= 0 || from === to || !form.elements.date.value) {
    error.textContent = "Проверьте сумму, счета и дату перевода.";
    return;
  }
  submitting = true;
  button.disabled = true;
  error.textContent = "";
  try {
    await apiJson("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: from,
        to_account_id: to,
        type: "transfer",
        amount_minor: Math.round(amount * 100),
        occurred_on: form.elements.date.value,
        title: "Перевод между счетами",
      }),
    });
    await loadData();
    selectedAccountId = to;
    render();
  } catch (requestError) {
    error.textContent = requestError.message || "Не удалось выполнить перевод. Попробуйте ещё раз.";
  } finally {
    submitting = false;
    button.disabled = false;
  }
}

function showError(message) {
  const target = document.getElementById("accounts-error");
  target.hidden = !message;
  target.textContent = message;
}

async function loadData() {
  const [user, accountList, transactionList] = await Promise.all([
    apiJson("/api/auth/me"),
    apiJson("/api/accounts"),
    apiJson(`/api/transactions?month=${currentMonth()}`),
  ]);
  currency = user.currency || "KGS";
  accounts = accountList;
  transactions = transactionList;
  if (!accounts.some((account) => account.id === selectedAccountId)) {
    selectedAccountId = accounts[0]?.id ?? null;
  }
}

const me = await bootShell("acc");
if (me) {
  pageRoot().innerHTML = `<div class="card skel" style="height:180px"></div>`;
  try {
    currency = me.currency || "KGS";
    await loadData();
    render();
  } catch (error) {
    pageRoot().innerHTML = `<div class="accounts-error" role="alert">Не удалось загрузить счета: ${escapeHtml(error.message || "проверьте соединение и обновите страницу.")}</div>`;
  }
}
