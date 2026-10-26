import { apiJson } from "./api.js";
import { formatMoney, monthTitle, symbol } from "./format.js";
import { icon } from "./icons.js";
import { bootShell, pageRoot } from "./layout.js";

const PAGE_SIZE = 10;
const MONTH_NAMES = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const TYPE_LABELS = { expense: "Расходы", income: "Доходы", transfer: "Перевод" };
const ICON_MAP = { bag: "bag", cafe: "cafe", car: "car", loop: "loop", home: "house", income: "income" };

let transactions = [];
let categories = [];
let accounts = [];
let currency = "KGS";
let activeType = "all";
let page = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function safeColor(value) {
  return /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value || "") ? value : "#6D5DFB";
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function currentMonthTransactions() {
  const month = currentMonth();
  return transactions.filter((tx) => tx.occurred_on.startsWith(month));
}

function filteredTransactions() {
  const query = document.getElementById("operations-query").value.trim().toLocaleLowerCase("ru");
  const categoryId = document.getElementById("operations-category-filter").value;
  const accountId = document.getElementById("operations-account-filter").value;

  return currentMonthTransactions().filter((tx) => {
    const typeMatch = activeType === "all" || tx.type === activeType;
    const categoryMatch = categoryId === "all" || String(tx.category_id) === categoryId;
    const accountMatch =
      accountId === "all" || String(tx.account_id) === accountId || String(tx.to_account_id) === accountId;
    const text = `${tx.title} ${tx.category_name || ""} ${tx.account_name || ""}`.toLocaleLowerCase("ru");
    return typeMatch && categoryMatch && accountMatch && (!query || text.includes(query));
  });
}

function dayHeading(iso) {
  const date = new Date(`${iso}T00:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (left, right) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  const label = sameDay(date, today) ? "Сегодня" : sameDay(date, yesterday) ? "Вчера" : date.getDate();
  return `${label} · ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

function transactionIcon(tx) {
  if (tx.type === "transfer") return "loop";
  if (tx.type === "income") return "income";
  return ICON_MAP[tx.category_icon] || "bag";
}

function signedLabel(tx) {
  if (tx.type === "income") return `+${formatMoney(tx.amount_minor, currency)}`;
  if (tx.type === "expense") return `−${formatMoney(tx.amount_minor, currency)}`;
  return formatMoney(tx.amount_minor, currency);
}

function renderRows(items) {
  if (!items.length) {
    return `<div class="operations-empty">По выбранным условиям операции не найдены.</div>`;
  }

  const groups = new Map();
  for (const tx of items) {
    const rows = groups.get(tx.occurred_on) || [];
    rows.push(tx);
    groups.set(tx.occurred_on, rows);
  }

  return [...groups.entries()]
    .map(([day, dayItems]) => {
      const net = dayItems.reduce((total, tx) => {
        if (tx.type === "income") return total + tx.amount_minor;
        if (tx.type === "expense") return total - tx.amount_minor;
        return total;
      }, 0);
      const dayTotal = `${net > 0 ? "+" : net < 0 ? "−" : ""}${formatMoney(Math.abs(net), currency)}`;
      return `
        <div class="operations-day">${dayHeading(day)}</div>
        <div class="operations-day-total">${dayTotal}</div>
        ${dayItems
          .map((tx) => {
            const typeClass = tx.type === "income" ? "income" : tx.type === "transfer" ? "transfer" : "";
            const category = tx.type === "transfer" ? TYPE_LABELS.transfer : tx.category_name || "Без категории";
            return `
              <div class="operations-row">
                <div class="operations-name">
                  <span class="operations-icon ${typeClass}">${icon(transactionIcon(tx))}</span>
                  <span class="operations-title" title="${escapeHtml(tx.title)}">${escapeHtml(tx.title)}</span>
                </div>
                <span class="operations-category"><span class="pill ${typeClass === "income" ? "income" : ""}">${escapeHtml(category)}</span></span>
                <span class="operations-account">${escapeHtml(tx.account_name)}</span>
                <span class="operations-amount ${typeClass}">${signedLabel(tx)}</span>
              </div>`;
          })
          .join("")}`;
    })
    .join("");
}

function renderSummary(items) {
  const income = items.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount_minor, 0);
  const expense = items.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount_minor, 0);
  const net = income - expense;
  const month = currentMonth().split("-").map(Number);
  const expensesByCategory = new Map();
  for (const tx of items) {
    if (tx.type === "expense") {
      const key = tx.category_name || "Без категории";
      const entry = expensesByCategory.get(key) || { amount: 0, color: tx.category_color || "#6D5DFB" };
      entry.amount += tx.amount_minor;
      expensesByCategory.set(key, entry);
    }
  }
  const popular = [...expensesByCategory.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5);
  const max = popular[0]?.[1].amount || 1;

  document.getElementById("operations-summary").innerHTML = `
    <div class="operations-summary-label">Итог по выбранным операциям</div>
    <div class="operations-net ${net < 0 ? "negative" : ""}">${net > 0 ? "+" : net < 0 ? "−" : ""}${formatMoney(Math.abs(net), currency)}</div>
    <div class="operations-summary-meta">${items.length} ${items.length === 1 ? "операция" : "операций"} · ${monthTitle(month[0], month[1])}</div>
    <div class="operations-summary-pairs">
      <div class="operations-summary-pair"><span>Доходы</span><strong>+${formatMoney(income, currency)}</strong></div>
      <div class="operations-summary-pair"><span>Расходы</span><strong>−${formatMoney(expense, currency)}</strong></div>
    </div>`;

  document.getElementById("operations-category-list").innerHTML = popular.length
    ? popular
        .map(
          ([name, value]) => `
            <div class="operations-category-item">
              <div class="operations-category-line"><span>${escapeHtml(name)}</span><span>${formatMoney(value.amount, currency)}</span></div>
              <div class="operations-category-track"><span style="width:${Math.max(4, (value.amount / max) * 100)}%;--category-color:${safeColor(value.color)}"></span></div>
            </div>`,
        )
        .join("")
    : `<div class="operations-category-empty">Расходы появятся здесь после добавления операций.</div>`;
}

function renderResults() {
  const items = filteredTransactions();
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  page = Math.min(page, pageCount - 1);
  const first = page * PAGE_SIZE;
  const visible = items.slice(first, first + PAGE_SIZE);
  const from = items.length ? first + 1 : 0;
  const to = Math.min(first + PAGE_SIZE, items.length);

  document.getElementById("operations-list").innerHTML = renderRows(visible);
  document.getElementById("operations-count").textContent = `Показано ${from}–${to} из ${items.length} операций`;
  document.getElementById("operations-page-number").textContent = String(page + 1);
  document.getElementById("operations-prev").disabled = page === 0;
  document.getElementById("operations-next").disabled = page >= pageCount - 1;
  renderSummary(items);
}

function renderPage() {
  activeType = "all";
  page = 0;
  const month = currentMonth().split("-").map(Number);
  const expenseCategories = categories.filter((category) => category.kind === "expense");
  pageRoot().innerHTML = `
    <div class="operations-page">
      <header class="page-head operations-head">
        <div>
          <h1>Операции</h1>
          <p>Все поступления и траты за ${monthTitle(month[0], month[1]).toLowerCase()}.</p>
        </div>
        <div class="head-actions">
          <button class="ghost btn2" id="operations-export" type="button">${icon("download")}Экспорт CSV</button>
          <button class="primary addbtn" id="operations-add" type="button">${icon("plus")}Добавить расход</button>
        </div>
      </header>
      <section class="operations-toolbar" aria-label="Поиск и фильтры операций">
        <label class="operations-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 4 4"></path></svg>
          <input id="operations-query" type="search" placeholder="Поиск по названию или категории" autocomplete="off">
        </label>
        <div class="operations-tabs" role="group" aria-label="Тип операции">
          <button class="operations-tab" type="button" data-type="all" aria-pressed="true">Все</button>
          <button class="operations-tab" type="button" data-type="expense" aria-pressed="false">Расходы</button>
          <button class="operations-tab" type="button" data-type="income" aria-pressed="false">Доходы</button>
        </div>
        <select class="operations-filter" id="operations-category-filter" aria-label="Фильтр по категории">
          <option value="all">Все категории</option>
          ${categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}
        </select>
        <select class="operations-filter" id="operations-account-filter" aria-label="Фильтр по счёту">
          <option value="all">Все счета</option>
          ${accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("")}
        </select>
      </section>
      <div class="operations-grid">
        <section class="card operations-table-card" aria-label="Список операций">
          <div class="operations-table-head"><span>ОПЕРАЦИЯ</span><span>КАТЕГОРИЯ</span><span>СЧЁТ</span><span>СУММА</span></div>
          <div class="operations-list" id="operations-list"></div>
          <footer class="operations-pagination">
            <span id="operations-count"></span>
            <span class="operations-pagination-controls">
              <button class="operations-page-button" id="operations-prev" type="button" aria-label="Предыдущая страница">${icon("arrow-left")}</button>
              <span class="operations-page-number" id="operations-page-number">1</span>
              <button class="operations-page-button" id="operations-next" type="button" aria-label="Следующая страница">${icon("arrow-right")}</button>
            </span>
          </footer>
        </section>
        <aside class="operations-aside">
          <section class="operations-summary" id="operations-summary" aria-live="polite"></section>
          <section class="card operations-categories">
            <h2>Главные категории</h2>
            <div class="operations-category-list" id="operations-category-list"></div>
          </section>
          <div class="operations-tip">
            <span class="operations-tip-icon">${icon("spark")}</span>
            <span>Отмечайте траты регулярно, чтобы лучше видеть свои привычки.<br><a href="/assistant">Спросить помощника →</a></span>
          </div>
        </aside>
      </div>
      <div class="operations-modal-back" id="operations-modal" hidden>
        <form class="operations-modal" id="operations-form">
          <h2>Новый расход</h2>
          <p>Добавьте расход, чтобы он появился в списке операций.</p>
          <label class="operations-form-field">Название
            <input name="title" maxlength="120" required placeholder="Например, продукты">
          </label>
          <label class="operations-form-field">Сумма (${symbol(currency)})
            <input name="amount" required inputmode="decimal" autocomplete="off" placeholder="0">
          </label>
          <label class="operations-form-field">Категория
            <select name="category">
              <option value="">Без категории</option>
              ${expenseCategories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}
            </select>
          </label>
          <label class="operations-form-field">Счёт
            <select name="account" required>
              ${accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("")}
            </select>
          </label>
          <label class="operations-form-field">Дата
            <input name="date" type="date" required>
          </label>
          <p class="operations-form-error" id="operations-form-error" role="alert"></p>
          <div class="operations-modal-actions">
            <button class="ghost btn2" id="operations-cancel" type="button">Отмена</button>
            <button class="primary addbtn" type="submit">Сохранить расход</button>
          </div>
        </form>
      </div>
    </div>`;

  const modal = document.getElementById("operations-modal");
  const form = document.getElementById("operations-form");
  const dateInput = form.elements.date;
  dateInput.value = localDateValue();

  for (const input of [
    document.getElementById("operations-query"),
    document.getElementById("operations-category-filter"),
    document.getElementById("operations-account-filter"),
  ]) {
    input.addEventListener(input.tagName === "INPUT" ? "input" : "change", () => {
      page = 0;
      renderResults();
    });
  }
  document.querySelectorAll(".operations-tab").forEach((button) => {
    button.addEventListener("click", () => {
      activeType = button.dataset.type;
      page = 0;
      document.querySelectorAll(".operations-tab").forEach((tab) => {
        tab.setAttribute("aria-pressed", String(tab === button));
      });
      renderResults();
    });
  });
  document.getElementById("operations-prev").addEventListener("click", () => {
    page = Math.max(0, page - 1);
    renderResults();
  });
  document.getElementById("operations-next").addEventListener("click", () => {
    page += 1;
    renderResults();
  });
  document.getElementById("operations-export").addEventListener("click", exportCsv);
  document.getElementById("operations-add").addEventListener("click", () => {
    if (!accounts.length) {
      showError("Чтобы добавить расход, сначала создайте счёт в разделе «Счета».");
      return;
    }
    modal.hidden = false;
    form.elements.title.focus();
  });
  document.getElementById("operations-cancel").addEventListener("click", () => {
    modal.hidden = true;
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.hidden = true;
  });
  form.addEventListener("submit", submitExpense);
  renderResults();
}

function showError(message) {
  const root = pageRoot();
  let error = root.querySelector(".operations-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "operations-error";
    error.setAttribute("role", "alert");
    root.prepend(error);
  }
  error.textContent = message;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const items = filteredTransactions();
  const rows = [
    ["Дата", "Операция", "Тип", "Категория", "Счёт", "Сумма"],
    ...items.map((tx) => [
      tx.occurred_on,
      tx.title,
      TYPE_LABELS[tx.type] || tx.type,
      tx.category_name || "",
      tx.account_name,
      tx.type === "expense" ? -tx.amount_minor / 100 : tx.amount_minor / 100,
    ]),
  ];
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `money-tracker-${currentMonth()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function submitExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.getElementById("operations-form-error");
  const submit = form.querySelector('button[type="submit"]');
  const amount = Number(String(form.elements.amount.value).trim().replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    error.textContent = "Введите сумму больше нуля.";
    form.elements.amount.focus();
    return;
  }

  error.textContent = "";
  submit.disabled = true;
  try {
    await apiJson("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: Number(form.elements.account.value),
        category_id: form.elements.category.value ? Number(form.elements.category.value) : null,
        type: "expense",
        amount_minor: Math.round(amount * 100),
        occurred_on: form.elements.date.value,
        title: form.elements.title.value.trim(),
      }),
    });
    document.getElementById("operations-modal").hidden = true;
    page = 0;
    await loadData();
    renderPage();
  } catch (submitError) {
    error.textContent = submitError.message || "Не удалось сохранить расход. Попробуйте ещё раз.";
  } finally {
    submit.disabled = false;
  }
}

async function loadData() {
  const [user, txs, categoryList, accountList] = await Promise.all([
    apiJson("/api/auth/me"),
    apiJson(`/api/transactions?month=${currentMonth()}`),
    apiJson("/api/categories"),
    apiJson("/api/accounts"),
  ]);
  currency = user.currency || "KGS";
  transactions = txs;
  categories = categoryList;
  accounts = accountList;
}

const me = await bootShell("ops");
if (me) {
  pageRoot().innerHTML = `<div class="card skel" style="height:180px"></div>`;
  try {
    await loadData();
    renderPage();
  } catch (error) {
    pageRoot().innerHTML = `<div class="operations-error" role="alert">Не удалось загрузить операции: ${escapeHtml(error.message || "проверьте соединение и обновите страницу.")}</div>`;
  }
}
