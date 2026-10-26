import { apiJson } from "./api.js";
import { formatMoney, monthTitle, symbol } from "./format.js";
import { icon } from "./icons.js";
import { bootShell, pageRoot } from "./layout.js";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const MONTHS_INSTRUMENTAL = [
  "январём",
  "февралём",
  "мартом",
  "апрелем",
  "маем",
  "июнем",
  "июлем",
  "августом",
  "сентябрём",
  "октябрём",
  "ноябрём",
  "декабрём",
];
const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

let monthKey = currentMonthKey();
let currency = "KGS";
let currentTransactions = [];
let previousTransactions = [];
let selectedDay = null;
let chartMode = "all";

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(key) {
  const [year, month] = key.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

function parseMonth(key) {
  return key.split("-").map(Number);
}

function monthDayCount(key) {
  const [year, month] = parseMonth(key);
  return new Date(year, month, 0).getDate();
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

function amountByType(items, type) {
  return items.filter((tx) => tx.type === type).reduce((sum, tx) => sum + tx.amount_minor, 0);
}

function plural(value, one, few, many) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function expensesPerDay(items) {
  const result = new Map();
  for (const tx of items) {
    if (tx.type !== "expense") continue;
    const day = Number(tx.occurred_on.slice(-2));
    result.set(day, (result.get(day) || 0) + tx.amount_minor);
  }
  return result;
}

function expensesPerCategory(items) {
  const result = new Map();
  for (const tx of items) {
    if (tx.type !== "expense") continue;
    const name = tx.category_name || "Без категории";
    const current = result.get(name) || { amount: 0, color: tx.category_color || "#6D5DFB" };
    current.amount += tx.amount_minor;
    result.set(name, current);
  }
  return result;
}

function groupThousands(value) {
  return Math.round(value).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

function renderStatCards() {
  const expenses = amountByType(currentTransactions, "expense");
  const income = amountByType(currentTransactions, "income");
  const days = monthDayCount(monthKey);
  const [year, month] = parseMonth(monthKey);
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const elapsedDays = isCurrentMonth ? now.getDate() : days;
  const dailyAverage = elapsedDays ? Math.round(expenses / elapsedDays) : 0;
  const savings = income - expenses;
  const savingsRate = income ? (savings / income) * 100 : 0;
  const byDay = expensesPerDay(currentTransactions);
  let largestDay = 0;
  for (const value of byDay.values()) largestDay = Math.max(largestDay, value);
  const noSpendDays = Math.max(0, elapsedDays - [...byDay.keys()].filter((day) => day <= elapsedDays).length);

  document.getElementById("analytics-stats").innerHTML = `
    <article class="analytics-stat card">
      <div class="analytics-stat-label">Средний расход в день <span>${icon("cal")}</span></div>
      <strong>${formatMoney(dailyAverage, currency)}</strong>
      <small>за ${elapsedDays} ${plural(elapsedDays, "день", "дня", "дней")} · ${monthTitle(year, month)}</small>
    </article>
    <article class="analytics-stat card">
      <div class="analytics-stat-label">Норма сбережений <span>${icon("spark")}</span></div>
      <strong>${savingsRate < 0 ? "−" : ""}${String(Math.abs(savingsRate).toFixed(1)).replace(".", ",")}%</strong>
      <small>${savings < 0 ? `расходы выше доходов на ${formatMoney(Math.abs(savings), currency)}` : `сохранено ${formatMoney(savings, currency)} из ${formatMoney(income, currency)}`}</small>
    </article>
    <article class="analytics-stat card">
      <div class="analytics-stat-label">Самый затратный день <span>${icon("cal")}</span></div>
      <strong>${largestDay ? `${largestDay} ${MONTHS[month - 1].slice(0, 3)}` : "—"}</strong>
      <small>${largestDay ? `${formatMoney(byDay.get(largestDay), currency)} за день` : "Пока нет расходов"}</small>
    </article>
    <article class="analytics-stat card">
      <div class="analytics-stat-label">Дни без трат <span>${icon("income")}</span></div>
      <strong>${noSpendDays}</strong>
      <small>из ${elapsedDays} дн. · ${Math.round((noSpendDays / Math.max(elapsedDays, 1)) * 100)}%</small>
    </article>`;
}

function renderChart() {
  const values = expensesPerDay(currentTransactions);
  const [year, month] = parseMonth(monthKey);
  const now = new Date();
  const days = monthDayCount(monthKey);
  const count = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : days;
  const entries = Array.from({ length: count }, (_, index) => ({
    day: index + 1,
    amount: values.get(index + 1) || 0,
  }));
  const visibleEntries = chartMode === "with-expenses" ? entries.filter((entry) => entry.amount > 0) : entries;
  const max = Math.max(...visibleEntries.map((entry) => entry.amount), 1);
  const hasExpenses = [...values.values()].some((amount) => amount > 0);
  const scale = hasExpenses ? Math.ceil(max / 100 / 5) * 5 || 5 : 0;
  const ticks = [1, 0.5, 0];

  document.getElementById("analytics-chart").innerHTML = `
    <div class="analytics-chart-y">
      ${ticks.map((fraction) => `<span>${groupThousands(scale * fraction * 100)}</span>`).join("")}
    </div>
    <div class="analytics-chart-main">
      ${ticks.map((fraction) => `<span class="analytics-chart-grid" style="bottom:${fraction * 100}%"></span>`).join("")}
      <div class="analytics-bars" style="grid-template-columns:repeat(${Math.max(visibleEntries.length, 1)},minmax(0,1fr))">
        ${visibleEntries
          .map(
            ({ day, amount }) => `
              <button class="analytics-bar-wrap" type="button" data-chart-day="${day}" title="${day} ${MONTHS[month - 1].toLowerCase()}: ${formatMoney(amount, currency)}">
                <span class="analytics-bar ${amount ? "" : "empty"}" style="height:${amount ? Math.max(3, (amount / max) * 100) : 3}%"></span>
                <span class="analytics-bar-label">${day}</span>
              </button>`,
          )
          .join("")}
      </div>
      ${hasExpenses ? "" : `<div class="analytics-chart-empty">Пока нет расходов за этот месяц</div>`}
      ${
        max > 1
          ? `<span class="analytics-average-line" style="bottom:${Math.min(100, (amountByType(currentTransactions, "expense") / Math.max(count, 1) / max) * 100)}%">
              <span>Среднее ${formatMoney(Math.round(amountByType(currentTransactions, "expense") / Math.max(count, 1)), currency)}</span>
            </span>`
          : ""
      }
    </div>`;

  document.querySelectorAll(".analytics-bar-wrap").forEach((bar) => {
    bar.addEventListener("click", () => {
      selectedDay = Number(bar.dataset.chartDay);
      renderCalendar();
      renderInsights();
    });
  });
}

function renderCalendar() {
  const [year, month] = parseMonth(monthKey);
  const count = monthDayCount(monthKey);
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const values = expensesPerDay(currentTransactions);
  const max = Math.max(...values.values(), 1);
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(`<span class="analytics-calendar-empty" aria-hidden="true"></span>`);
  }
  for (let day = 1; day <= count; day += 1) {
    const amount = values.get(day) || 0;
    const intensity = amount ? Math.max(0.14, amount / max) : 0;
    const isSelected = day === selectedDay;
    cells.push(`
      <button class="analytics-calendar-day ${amount ? "has-expense" : ""} ${isSelected ? "selected" : ""}" type="button"
        data-calendar-day="${day}" style="--heat:${intensity}" aria-label="${day} ${MONTHS[month - 1]}, ${formatMoney(amount, currency)}"
        ${amount ? `title="${formatMoney(amount, currency)}"` : ""}>${day}</button>`);
  }

  document.getElementById("analytics-calendar-title").textContent = monthTitle(year, month);
  document.getElementById("analytics-calendar-grid").innerHTML = `
    ${WEEKDAYS.map((day) => `<span class="analytics-weekday">${day}</span>`).join("")}
    ${cells.join("")}`;
  document.querySelectorAll(".analytics-calendar-day").forEach((cell) => {
    cell.addEventListener("click", () => {
      selectedDay = Number(cell.dataset.calendarDay);
      renderCalendar();
      renderInsights();
    });
  });
}

function renderComparisons() {
  const current = expensesPerCategory(currentTransactions);
  const previous = expensesPerCategory(previousTransactions);
  const names = new Set([...current.keys(), ...previous.keys()]);
  const rows = [...names]
    .map((name) => ({
      name,
      current: current.get(name)?.amount || 0,
      previous: previous.get(name)?.amount || 0,
      color: current.get(name)?.color || previous.get(name)?.color || "#6D5DFB",
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 5);
  const max = Math.max(...rows.flatMap((row) => [row.current, row.previous]), 1);
  const previousMonth = parseMonth(previousMonthKey(monthKey))[1];
  const previousLabel = `${MONTHS_INSTRUMENTAL[previousMonth - 1]} ${parseMonth(previousMonthKey(monthKey))[0]}`;

  document.getElementById("analytics-comparison-title").textContent = `Сравнение с ${previousLabel}`;
  document.getElementById("analytics-comparison").innerHTML = rows.length
    ? rows
        .map((row) => {
          const difference = row.previous ? ((row.current - row.previous) / row.previous) * 100 : row.current ? 100 : 0;
          const change = row.previous ? `${difference > 0 ? "+" : ""}${Math.round(difference)}%` : row.current ? "Новое" : "0%";
          const tone = difference > 0 ? "up" : difference < 0 ? "down" : "steady";
          return `
            <div class="analytics-compare-item">
              <div class="analytics-compare-name"><span class="analytics-dot" style="--dot:${safeColor(row.color)}"></span><strong>${escapeHtml(row.name)}</strong><span class="analytics-change ${tone}">${change}</span></div>
              <div class="analytics-compare-track"><span style="width:${Math.max(row.current ? 3 : 0, (row.current / max) * 100)}%;--compare:${safeColor(row.color)}"></span></div>
              <div class="analytics-compare-track previous"><span style="width:${Math.max(row.previous ? 3 : 0, (row.previous / max) * 100)}%"></span></div>
              <div class="analytics-compare-values"><span>${formatMoney(row.current, currency)}</span><span>${formatMoney(row.previous, currency)}</span></div>
            </div>`;
        })
        .join("")
    : `<p class="analytics-muted">Добавьте расходы, чтобы увидеть сравнение категорий.</p>`;
}

function renderInsights() {
  const byDay = expensesPerDay(currentTransactions);
  const categories = expensesPerCategory(currentTransactions);
  const priorCategories = expensesPerCategory(previousTransactions);
  const top = [...categories.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
  const categoryChanges = [...categories.entries()]
    .map(([name, value]) => ({
      name,
      amount: value.amount,
      prior: priorCategories.get(name)?.amount || 0,
      color: value.color,
    }))
    .filter((item) => item.prior > 0)
    .sort((a, b) => Math.abs(b.amount - b.prior) - Math.abs(a.amount - a.prior));
  const changed = categoryChanges[0];
  const highest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const month = parseMonth(monthKey);
  const selectedAmount = selectedDay ? byDay.get(selectedDay) || 0 : 0;
  const insights = [];

  if (selectedDay !== null) {
    insights.push({
      icon: "cal",
      color: "purple",
      title: `${selectedDay} ${MONTHS[month[1] - 1].toLowerCase()}`,
      text: selectedAmount
        ? `За этот день потрачено ${formatMoney(selectedAmount, currency)}.`
        : "В этот день расходов не было.",
    });
  }
  if (top) {
    const share = amountByType(currentTransactions, "expense")
      ? Math.round((top[1].amount / amountByType(currentTransactions, "expense")) * 100)
      : 0;
    insights.push({
      icon: "bag",
      color: "yellow",
      title: `${top[0]}: ${share}% ваших расходов`,
      text: `${formatMoney(top[1].amount, currency)} за ${monthTitle(month[0], month[1]).toLowerCase()}.`,
    });
  }
  if (changed && changed.prior !== changed.amount) {
    const delta = Math.round(((changed.amount - changed.prior) / changed.prior) * 100);
    insights.push({
      icon: "income",
      color: "green",
      title: `${changed.name}: на ${Math.abs(delta)}% ${delta > 0 ? "больше" : "меньше"}`,
      text: `${formatMoney(changed.amount, currency)} сейчас против ${formatMoney(changed.prior, currency)} в прошлом месяце.`,
    });
  } else if (highest) {
    insights.push({
      icon: "cal",
      color: "green",
      title: "Самый затратный день",
      text: `${highest[0]} ${MONTHS[month[1] - 1].toLowerCase()}: ${formatMoney(highest[1], currency)}.`,
    });
  }
  if (!insights.length) {
    insights.push({
      icon: "spark",
      color: "purple",
      title: "Здесь появятся ваши финансовые привычки",
      text: "Добавьте несколько операций, чтобы увидеть полезные наблюдения.",
    });
  }

  document.getElementById("analytics-insights").innerHTML = insights
    .slice(0, 3)
    .map(
      (item) => `
        <div class="analytics-insight">
          <span class="analytics-insight-icon ${item.color}">${icon(item.icon)}</span>
          <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></span>
        </div>`,
    )
    .join("");
  const count = monthDayCount(monthKey);
  const now = new Date();
  const elapsedDays = now.getFullYear() === month[0] && now.getMonth() + 1 === month[1] ? now.getDate() : count;
  const noSpendDays = Math.max(0, elapsedDays - [...byDay.keys()].filter((day) => day <= elapsedDays).length);
  document.getElementById("analytics-expense-free-count").textContent =
    `${noSpendDays} ${plural(noSpendDays, "день", "дня", "дней")} без трат`;
}

function render() {
  const [year, month] = parseMonth(monthKey);
  pageRoot().innerHTML = `
    <div class="analytics-page">
      <header class="page-head analytics-head">
        <div>
          <h1>Аналитика</h1>
          <p>Куда уходят деньги и как меняются ваши привычки.</p>
        </div>
        <div class="head-actions">
          <label class="analytics-month-control">${icon("cal")}<input id="analytics-month" type="month" value="${monthKey}" aria-label="Выберите месяц"></label>
          <button class="primary addbtn" id="analytics-export" type="button">${icon("download")}Скачать отчёт</button>
        </div>
      </header>
      <section class="analytics-stats" id="analytics-stats" aria-label="Итоги месяца"></section>
      <div class="analytics-row analytics-row-top">
        <section class="card analytics-chart-card">
          <div class="analytics-section-head">
            <div><h2>Траты по дням</h2><p>${monthTitle(year, month)}</p></div>
            <div class="analytics-segment" role="group" aria-label="Показать дни">
              <button type="button" data-chart-mode="all" aria-pressed="true">Все траты</button>
              <button type="button" data-chart-mode="with-expenses" aria-pressed="false">Без нулевых</button>
            </div>
          </div>
          <div class="analytics-chart" id="analytics-chart"></div>
        </section>
        <section class="card analytics-comparison-card">
          <div class="analytics-section-head">
            <div><h2 id="analytics-comparison-title">Сравнение</h2><p><span class="analytics-legend current"></span> ${monthTitle(year, month)} <span class="analytics-legend previous"></span> прошлый месяц</p></div>
          </div>
          <div class="analytics-comparison" id="analytics-comparison"></div>
        </section>
      </div>
      <div class="analytics-row analytics-row-bottom">
        <section class="card analytics-calendar-card">
          <div class="analytics-section-head">
            <h2>Календарь трат</h2>
            <span class="analytics-calendar-title" id="analytics-calendar-title"></span>
          </div>
          <div class="analytics-calendar" id="analytics-calendar-grid"></div>
          <div class="analytics-heat-legend"><span id="analytics-expense-free-count"></span><span>Меньше</span><i></i><i></i><i></i><i></i><span>Больше</span></div>
        </section>
        <section class="card analytics-insights-card">
          <div class="analytics-section-head"><h2>Что видно из данных</h2></div>
          <div class="analytics-insights" id="analytics-insights"></div>
          <a class="analytics-assistant-link" href="/assistant">${icon("spark")}Обсудить с ИИ-помощником</a>
        </section>
      </div>
    </div>`;

  selectedDay = null;
  renderStatCards();
  renderChart();
  renderCalendar();
  renderComparisons();
  renderInsights();
  document.getElementById("analytics-month").addEventListener("change", async (event) => {
    if (!event.target.value) return;
    monthKey = event.target.value;
    selectedDay = null;
    const exportButton = document.getElementById("analytics-export");
    exportButton.disabled = true;
    try {
      await loadMonthData();
      render();
    } catch (error) {
      showError(`Не удалось загрузить аналитику: ${error.message || "проверьте соединение и попробуйте ещё раз."}`);
    } finally {
      document.getElementById("analytics-export")?.removeAttribute("disabled");
    }
  });
  document.getElementById("analytics-export").addEventListener("click", exportReport);
  document.querySelectorAll("[data-chart-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      chartMode = button.dataset.chartMode;
      document.querySelectorAll("[data-chart-mode]").forEach((tab) => {
        tab.setAttribute("aria-pressed", String(tab === button));
      });
      renderChart();
    });
  });
}

function showError(message) {
  let error = pageRoot().querySelector(".analytics-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "analytics-error";
    error.setAttribute("role", "alert");
    pageRoot().prepend(error);
  }
  error.textContent = message;
}

function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function exportReport() {
  const [year, month] = parseMonth(monthKey);
  const byDay = expensesPerDay(currentTransactions);
  const byCategory = expensesPerCategory(currentTransactions);
  const lines = [
    ["Аналитический отчёт", monthTitle(year, month)],
    ["Валюта", currency],
    [],
    ["Дата", "Расходы"],
    ...[...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, value]) => [`${monthKey}-${String(day).padStart(2, "0")}`, value / 100]),
    [],
    ["Категория", "Расходы"],
    ...[...byCategory.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([name, value]) => [name, value.amount / 100]),
    [],
    ["Доходы", amountByType(currentTransactions, "income") / 100],
    ["Расходы всего", amountByType(currentTransactions, "expense") / 100],
  ];
  const csv = `\uFEFF${lines.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `money-tracker-analytics-${monthKey}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function loadMonthData() {
  const previousKey = previousMonthKey(monthKey);
  [currentTransactions, previousTransactions] = await Promise.all([
    apiJson(`/api/transactions?month=${monthKey}`),
    apiJson(`/api/transactions?month=${previousKey}`),
  ]);
}

const me = await bootShell("ana");
if (me) {
  pageRoot().innerHTML = `<div class="card skel" style="height:180px"></div>`;
  try {
    currency = me.currency || "KGS";
    await loadMonthData();
    render();
  } catch (error) {
    const message = `Не удалось загрузить аналитику: ${error.message || "проверьте соединение и обновите страницу."}`;
    showError(message);
  }
}
