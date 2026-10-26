import { apiJson } from "./api.js";
import { formatMoney, monthTitle, symbol } from "./format.js";
import { icon } from "./icons.js";
import { bootShell, pageRoot } from "./layout.js";

const QUICK_ADJUSTMENT_MINOR = 100_000;
const CATEGORY_ICONS = {
  home: "house",
  housing: "house",
  food: "bag",
  groceries: "bag",
  cafe: "cafe",
  transport: "car",
  subscriptions: "loop",
};

let monthKey = currentMonthKey();
let currency = "KGS";
let categories = [];
let budgets = [];
let dashboard = null;
let submitting = false;

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(value = monthKey) {
  return value.split("-").map(Number);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function safeColor(value) {
  return /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value || "") ? value : "#6D5DFB";
}

function overallBudget() {
  return budgets.find((budget) => budget.category_id === null) || null;
}

function categoryBudgets() {
  return budgets.filter((budget) => budget.category_id !== null);
}

function categoryForBudget(budget) {
  return categories.find((category) => category.id === budget.category_id);
}

function daysRemaining() {
  const [year, month] = parseMonth();
  const lastDay = new Date(year, month, 0).getDate();
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) return lastDay - now.getDate() + 1;
  return lastDay;
}

function budgetStatus(budget) {
  if (budget.percent >= 100) return { label: "Лимит превышен", key: "over" };
  if (budget.percent >= 80) return { label: "Близко к лимиту", key: "near" };
  return { label: "В норме", key: "ok" };
}

function renderOverview() {
  const total = overallBudget();
  const expense = dashboard?.expense_minor || 0;
  const limit = total?.limit_minor || 0;
  const percent = limit ? Math.round((expense / limit) * 100) : 0;
  const cappedPercent = Math.min(percent, 100);
  const remaining = Math.max(0, limit - expense);
  const days = daysRemaining();
  const daily = remaining && days ? Math.floor(remaining / days) : 0;
  const categoryLimits = categoryBudgets().reduce((sum, item) => sum + item.limit_minor, 0);
  const unallocated = Math.max(0, limit - categoryLimits);
  const circumference = Math.PI * 58;
  const dashOffset = circumference * (1 - cappedPercent / 100);

  document.getElementById("budget-overview").innerHTML = `
    <section class="card budget-total-card">
      <div class="budget-gauge" role="img" aria-label="Использовано ${percent}% общего бюджета">
        <svg viewBox="0 0 140 92" aria-hidden="true">
          <path class="budget-gauge-track" d="M12 80 A58 58 0 0 1 128 80"></path>
          <path class="budget-gauge-progress" d="M12 80 A58 58 0 0 1 128 80" style="stroke-dasharray:${circumference};stroke-dashoffset:${dashOffset}"></path>
        </svg>
        <div class="budget-gauge-value"><strong>${percent}%</strong><span>использовано</span></div>
      </div>
      <div class="budget-total-detail">
        <div class="budget-total-heading">
          <h2>Общий бюджет месяца</h2>
          <button type="button" class="budget-edit-total" id="budget-edit-total" aria-label="Изменить общий бюджет">${icon("edit")}</button>
        </div>
        <div class="budget-total-info">
          <span class="budget-info-icon">${icon("wallet")}</span>
          <span><small>Осталось</small><strong>${formatMoney(remaining, currency)}</strong></span>
        </div>
        <div class="budget-total-info">
          <span class="budget-info-icon">${icon("cal")}</span>
          <span><small>До конца месяца</small><strong>${days} ${days === 1 ? "день" : "дней"}</strong></span>
        </div>
        <div class="budget-total-info">
          <span class="budget-info-icon">${icon("income")}</span>
          <span><small>Можно тратить</small><strong>${formatMoney(daily, currency)} в день</strong></span>
        </div>
        <div class="budget-total-foot">${formatMoney(expense, currency)} потрачено из ${limit ? formatMoney(limit, currency) : "бюджет не задан"}</div>
      </div>
    </section>
    <section class="card budget-distribution-card">
      <div class="budget-distribution-head">
        <h2>Распределение лимитов</h2>
        <small>Сумма лимитов по категориям против общего бюджета</small>
      </div>
      <div class="budget-distribution-total"><strong>${formatMoney(categoryLimits, currency)}</strong><span>из ${formatMoney(limit, currency)}</span></div>
      <div class="budget-distribution-track">
        ${
          categoryBudgets().length
            ? categoryBudgets()
                .map((budget, index) => {
                  const category = categoryForBudget(budget);
                  const color = safeColor(category?.color);
                  const width = limit ? (budget.limit_minor / limit) * 100 : 0;
                  return `<span title="${escapeHtml(category?.name || "Категория")}: ${formatMoney(budget.limit_minor, currency)}" style="width:${Math.min(width, 100)}%;--budget-color:${color};--i:${index}"></span>`;
                })
                .join("")
            : `<span class="budget-distribution-empty"></span>`
        }
      </div>
      <div class="budget-distribution-legend">
        ${categoryBudgets()
          .slice(0, 6)
          .map((budget) => {
            const category = categoryForBudget(budget);
            return `<span><i style="--budget-color:${safeColor(category?.color)}"></i>${escapeHtml(category?.name || "Категория")}</span>`;
          })
          .join("")}
      </div>
      <div class="budget-unallocated"><span>${categoryBudgets().length ? "Не распределено" : "Добавьте лимиты по категориям"}</span><strong>${formatMoney(unallocated, currency)}</strong></div>
    </section>`;

  document.getElementById("budget-edit-total").addEventListener("click", () => openBudgetModal(null));
}

function renderBudgetCard(budget) {
  const category = categoryForBudget(budget);
  const name = category?.name || budget.category_name || "Категория";
  const color = safeColor(category?.color);
  const iconName = CATEGORY_ICONS[category?.icon] || category?.icon || "bag";
  const status = budgetStatus(budget);
  const percent = Math.max(0, budget.percent || 0);
  const barWidth = Math.min(percent, 100);
  const remaining = Math.max(0, budget.limit_minor - budget.spent_minor);
  const daily = daysRemaining() ? Math.floor(remaining / daysRemaining()) : remaining;
  const dailyText = daily ? `${formatMoney(daily, currency)} / день` : "Лимит исчерпан";
  const cardId = `category-budget-${budget.category_id}`;
  return `
    <article class="budget-category-card card ${status.key}" style="--category-color:${color}" id="${cardId}">
      <div class="budget-category-head">
        <span class="budget-category-icon">${icon(iconName)}</span>
        <span class="budget-category-name"><strong>${escapeHtml(name)}</strong><small>Лимит: ${formatMoney(budget.limit_minor, currency)}</small></span>
        <span class="budget-adjust-controls">
          <button type="button" data-adjust="-1" data-budget-category="${budget.category_id}" aria-label="Уменьшить лимит на 1 000 ${symbol(currency)}" ${budget.limit_minor < QUICK_ADJUSTMENT_MINOR ? "disabled" : ""}>−</button>
          <button type="button" data-adjust="1" data-budget-category="${budget.category_id}" aria-label="Увеличить лимит на 1 000 ${symbol(currency)}">+</button>
        </span>
      </div>
      <div class="budget-category-main">
        <strong>${formatMoney(budget.spent_minor, currency)}</strong>
        <span class="budget-status ${status.key}">${status.label}</span>
      </div>
      <div class="budget-progress" role="progressbar" aria-label="${escapeHtml(name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(percent, 100)}">
        <span style="width:${barWidth}%;--progress-color:${status.key === "over" ? "#e5484d" : status.key === "near" ? "#d89b00" : color}"></span>
      </div>
      <div class="budget-category-foot"><strong>${percent}%</strong><span>${remaining ? `Осталось ${formatMoney(remaining, currency)} · ${dailyText}` : "Лимит исчерпан"}</span></div>
    </article>`;
}

function renderCategoryBudgets() {
  const cardMarkup = categoryBudgets()
    .map(renderBudgetCard)
    .join("");
  document.getElementById("budget-categories").innerHTML = `
    ${cardMarkup}
    <button class="budget-add-category" id="budget-add-category" type="button">
      <span>${icon("plus")}</span><strong>Добавить категорию</strong><small>Задайте лимит для новой статьи расходов</small>
    </button>`;

  document.getElementById("budget-add-category").addEventListener("click", () => openBudgetModal());
  document.querySelectorAll("[data-adjust]").forEach((button) => {
    button.addEventListener("click", () => adjustBudget(Number(button.dataset.budgetCategory), Number(button.dataset.adjust)));
  });
}

function render() {
  const [year, month] = parseMonth();
  const monthOptions = `
    <label class="budget-month-control">${icon("cal")}<input id="budgets-month" type="month" value="${monthKey}" aria-label="Выберите месяц"></label>`;
  pageRoot().innerHTML = `
    <div class="budgets-page">
      <header class="page-head budgets-head">
        <div>
          <h1>Бюджеты</h1>
          <p>Лимиты по категориям на ${monthTitle(year, month).toLowerCase()}. Меняйте их кнопками − и +.</p>
        </div>
        <div class="head-actions">
          ${monthOptions}
          <button class="primary addbtn" id="budgets-new" type="button">${icon("plus")}Новый бюджет</button>
        </div>
      </header>
      <section class="budgets-overview" id="budget-overview" aria-label="Общий бюджет и распределение"></section>
      <section class="budget-categories" id="budget-categories" aria-label="Лимиты по категориям"></section>
      <div class="budgets-error" id="budgets-error" role="alert" hidden></div>
      <div class="budget-modal-back" id="budget-modal" hidden>
        <form class="budget-modal" id="budget-form">
          <h2 id="budget-modal-title">Новый бюджет</h2>
          <p>Установите месячный лимит, чтобы контролировать расходы.</p>
          <label class="budget-form-field">Категория
            <select name="category" id="budget-form-category"></select>
          </label>
          <label class="budget-form-field">Лимит (${symbol(currency)})
            <input name="limit" required type="number" min="0" step="1" inputmode="decimal" placeholder="Например, 12 000">
          </label>
          <label class="budget-form-field">Месяц
            <input name="month" required type="month" value="${monthKey}">
          </label>
          <p class="budget-form-error" id="budget-form-error" role="alert"></p>
          <div class="budget-modal-actions">
            <button class="ghost btn2" id="budget-cancel" type="button">Отмена</button>
            <button class="primary addbtn" type="submit">Сохранить лимит</button>
          </div>
        </form>
      </div>
    </div>`;

  renderOverview();
  renderCategoryBudgets();
  document.getElementById("budgets-new").addEventListener("click", () => openBudgetModal());
  document.getElementById("budgets-month").addEventListener("change", async (event) => {
    if (!event.target.value || event.target.value === monthKey) return;
    const previousMonth = monthKey;
    monthKey = event.target.value;
    showPageError("");
    try {
      await loadData();
      render();
    } catch (error) {
      monthKey = previousMonth;
      event.target.value = previousMonth;
      showPageError(`Не удалось загрузить бюджет: ${error.message || "попробуйте ещё раз."}`);
    }
  });
  document.getElementById("budget-cancel").addEventListener("click", closeBudgetModal);
  const modal = document.getElementById("budget-modal");
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeBudgetModal();
  });
  document.getElementById("budget-form").addEventListener("submit", saveBudget);
}

function openBudgetModal(categoryId = undefined) {
  const form = document.getElementById("budget-form");
  const select = document.getElementById("budget-form-category");
  const existing = categoryId === undefined ? null : budgets.find((budget) => budget.category_id === categoryId);
  const alreadyAllocated = new Set(categoryBudgets().map((budget) => budget.category_id));
  const availableCategories = categories.filter(
    (category) => category.kind === "expense" && (!alreadyAllocated.has(category.id) || category.id === categoryId),
  );
  const isOverall = categoryId === null;
  const selectedCategory = categoryId === undefined ? availableCategories[0]?.id : categoryId;

  select.innerHTML = `
    <option value="">Общий бюджет месяца</option>
    ${availableCategories
      .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
      .join("")}`;
  select.value = selectedCategory === null || selectedCategory === undefined ? "" : String(selectedCategory);
  select.disabled = categoryId !== undefined;
  form.querySelector('button[type="submit"]').disabled = categoryId === undefined && !availableCategories.length;
  document.getElementById("budget-modal-title").textContent = existing ? "Изменить лимит" : "Новый бюджет";
  form.elements.limit.value = existing ? String(existing.limit_minor / 100) : "";
  form.elements.month.value = monthKey;
  document.getElementById("budget-form-error").textContent = "";
  document.getElementById("budget-modal").hidden = false;
  form.dataset.categoryId = isOverall ? "" : selectedCategory || "";
  if (categoryId === undefined && !availableCategories.length) {
    document.getElementById("budget-form-error").textContent =
      "Все категории расходов уже имеют бюджет. Измените лимит в карточке категории.";
  }
  form.elements.limit.focus();
}

function closeBudgetModal() {
  const modal = document.getElementById("budget-modal");
  if (modal) modal.hidden = true;
}

async function saveBudget(event) {
  event.preventDefault();
  if (submitting) return;
  const form = event.currentTarget;
  const amount = Number(String(form.elements.limit.value).trim().replace(",", "."));
  const [year, month] = form.elements.month.value.split("-").map(Number);
  const categoryId = form.elements.category.value;
  const error = document.getElementById("budget-form-error");
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(year) || month < 1 || month > 12) {
    error.textContent = "Проверьте сумму лимита и выбранный месяц.";
    return;
  }
  error.textContent = "";
  submitting = true;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiJson("/api/budgets", {
      method: "PUT",
      body: JSON.stringify({
        category_id: categoryId ? Number(categoryId) : null,
        year,
        month,
        limit_minor: Math.round(amount * 100),
      }),
    });
    monthKey = form.elements.month.value;
    closeBudgetModal();
    await loadData();
    render();
  } catch (saveError) {
    error.textContent = saveError.message || "Не удалось сохранить лимит. Попробуйте ещё раз.";
  } finally {
    submitting = false;
    button.disabled = false;
  }
}

async function adjustBudget(categoryId, direction) {
  const budget = budgets.find((item) => item.category_id === categoryId);
  if (!budget) return;
  const nextLimit = Math.max(0, budget.limit_minor + direction * QUICK_ADJUSTMENT_MINOR);
  try {
    await apiJson("/api/budgets", {
      method: "PUT",
      body: JSON.stringify({
        category_id: categoryId,
        year: budget.year,
        month: budget.month,
        limit_minor: nextLimit,
      }),
    });
    await loadData();
    render();
  } catch (error) {
    showPageError(`Не удалось изменить лимит: ${error.message || "попробуйте ещё раз."}`);
  }
}

function showPageError(message) {
  const target = document.getElementById("budgets-error");
  if (!target) return;
  target.hidden = !message;
  target.textContent = message;
}

async function loadData() {
  const monthQuery = encodeURIComponent(monthKey);
  const [me, categoryList, budgetList, dashboardData] = await Promise.all([
    apiJson("/api/auth/me"),
    apiJson("/api/categories"),
    apiJson(`/api/budgets?month=${monthQuery}`),
    apiJson(`/api/dashboard?month=${monthQuery}`),
  ]);
  currency = me.currency || "KGS";
  categories = categoryList;
  budgets = budgetList;
  dashboard = dashboardData;
}

const me = await bootShell("bud");
if (me) {
  pageRoot().innerHTML = `<div class="card skel" style="height:180px"></div>`;
  try {
    currency = me.currency || "KGS";
    await loadData();
    render();
  } catch (error) {
    const message = `Не удалось загрузить бюджеты: ${error.message || "проверьте соединение и обновите страницу."}`;
    pageRoot().innerHTML = `<div class="budgets-error" role="alert">${escapeHtml(message)}</div>`;
  }
}
