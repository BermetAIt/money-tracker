import { apiJson } from "./api.js";
import { formatCompact, formatDayShort, formatMoney, monthTitle, symbol } from "./format.js";
import { icon } from "./icons.js";
import { bootShell, emptyState, pageRoot } from "./layout.js";

const ICON_MAP = { bag: "bag", cafe: "cafe", car: "car", loop: "loop", home: "house", income: "income" };

function moneyHtml(minor, currency) {
  return `${formatCompact(minor)}<span class="cur">${symbol(currency)}</span>`;
}

function chartPath(points) {
  if (!points.length) return { line: "", area: "", last: { x: 0, y: 200 } };
  const max = Math.max(...points.map((p) => p.cumulative_minor), 1);
  const w = 640;
  const h = 210;
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? w : (i / (points.length - 1)) * w;
    const y = 195.5 - (p.cumulative_minor / max) * 141;
    return { x, y };
  });
  let line = `M${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i += 1) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const cpx = (prev.x + cur.x) / 2;
    line += ` C ${cpx} ${prev.y} ${cpx} ${cur.y} ${cur.x} ${cur.y}`;
  }
  return { line, area: `${line} L${coords.at(-1).x} 200 L${coords[0].x} 200 Z`, last: coords.at(-1), max };
}

function donut(categories) {
  const c = 2 * Math.PI * 60;
  let offset = 0;
  return categories
    .map((cat, i) => {
      const len = (cat.percent / 100) * c;
      const node = `<circle class="seg" style="--i:${i};--l:${len.toFixed(1)};stroke:${cat.color};stroke-dasharray:${len.toFixed(1)} 400;stroke-dashoffset:${-offset}" cx="80" cy="80" r="60" stroke-width="22"></circle>`;
      offset += len + 3;
      return node;
    })
    .join("");
}

function renderDashboard(data) {
  const cur = data.currency;
  const [year, month] = data.month.split("-").map(Number);
  const trend = data.trend;
  const path = chartPath(trend);
  const maxLabel = Math.ceil((path.max || 0) / 100 / 10000) * 10;
  const lead = data.categories[0];
  const ticks = trend.length
    ? [0, 0.18, 0.36, 0.54, 0.72, 1].map((t) => {
        const idx = Math.min(trend.length - 1, Math.round(t * (trend.length - 1)));
        return { left: t * 100, label: formatDayShort(trend[idx].day) };
      })
    : [];
  const incomeLabel =
    data.income_count > 0
      ? `Зарплата · ${data.income_count} ${data.income_count === 1 ? "поступление" : "поступления"}`
      : "Пока нет поступлений";
  const expenseLabel = `${data.expense_count ? "1–" : ""}${trend.at(-1) ? new Date(`${trend.at(-1).day}T00:00:00`).getDate() : "—"} ${monthTitle(year, month).split(" ")[0].slice(0, 3).toLowerCase()} · ${data.category_count} категорий`;

  pageRoot().innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px">
      <div class="page-head rise" style="--i:1">
        <div>
          <h1>Деньги под контролем.</h1>
          <p>${data.greeting_name}, вот как выглядит ваш ${monthTitle(year, month).split(" ")[0].toLowerCase()}.</p>
        </div>
        <div class="head-actions">
          <button class="ghost btn2" type="button">${icon("cal")}${data.month_label}</button>
          <button class="primary addbtn" id="add-expense" type="button">${icon("plus")}Добавить расход</button>
        </div>
      </div>
      <div class="kpis">
        <section class="card kpi kpi-balance rise" style="--i:2">
          <div class="drift" style="position:absolute;right:-50px;top:-60px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.35);filter:blur(30px)"></div>
          <div class="sweep" style="position:absolute;left:0;top:0;bottom:0;width:90px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0));pointer-events:none"></div>
          <div class="kpi-label" style="position:relative"><span>Общий баланс</span><span class="kpi-ico">${icon("wallet")}</span></div>
          <div class="kpi-value" style="position:relative">${moneyHtml(data.balance_minor, cur)}</div>
          <div class="kpi-foot" style="position:relative">
            <span>На начало месяца: ${formatMoney(data.month_start_balance_minor, cur)}</span>
            <svg width="84" height="34" viewBox="0 0 84 34" fill="none" aria-hidden="true"><path class="cline" pathLength="1" d="M2 30 C 14 28 18 20 28 22 S 44 24 52 14 S 70 8 82 4" stroke="#14122B" stroke-width="2.4" stroke-linecap="round"></path></svg>
          </div>
        </section>
        <section class="card kpi rise" style="--i:3">
          <div class="kpi-label"><span>Доходы за ${monthTitle(year, month).split(" ")[0].toLowerCase()}</span><span class="kpi-ico">${icon("income")}</span></div>
          <div class="kpi-value">${moneyHtml(data.income_minor, cur)}</div>
          <div class="kpi-foot">${incomeLabel}</div>
        </section>
        <section class="card kpi rise" style="--i:4">
          <div class="kpi-label"><span>Расходы за ${monthTitle(year, month).split(" ")[0].toLowerCase()}</span><span class="kpi-ico">${icon("expense")}</span></div>
          <div class="kpi-value">${moneyHtml(data.expense_minor, cur)}</div>
          <div class="kpi-foot">${expenseLabel}</div>
        </section>
      </div>
      <div class="mid-grid">
        <section class="card chart-card rise" style="--i:5">
          <div class="card-head"><h2>Динамика расходов</h2><a class="link" href="/analytics" style="border:none;background:transparent;font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px">Отчёт${icon("ext")}</a></div>
          <div class="chart-meta">
            <div>
              <div class="kpi-value">${moneyHtml(data.expense_minor, cur)}</div>
              <div class="kpi-foot" style="font-weight:500;margin-top:2px">Накопительно · ${data.month_label}</div>
            </div>
            <div class="segw" role="radiogroup" aria-label="Период графика">
              <input type="radio" name="pw" id="pw1">
              <input type="radio" name="pw" id="pw2" checked>
              <span class="segpill"></span>
              <label for="pw1">Неделя</label>
              <label for="pw2">Месяц</label>
            </div>
          </div>
          <div class="chart-plot">
            <div class="plot-box">
              <div class="grid-line" style="top:9.52%"></div>
              <div class="grid-line" style="top:52.38%"></div>
              <div class="grid-line" style="top:95.24%"></div>
              <span class="axis-label" style="top:9.52%">${maxLabel || 60} тыс.</span>
              <span class="axis-label" style="top:52.38%">${Math.round((maxLabel || 60) / 2)} тыс.</span>
              <span class="axis-label" style="top:95.24%">0</span>
              <svg viewBox="0 0 640 210" fill="none" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible">
                <defs><linearGradient id="fa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9AEFF" stop-opacity=".75"></stop><stop offset="1" stop-color="#B9AEFF" stop-opacity="0"></stop></linearGradient></defs>
                <path class="carea" d="${path.area}" fill="url(#fa)"></path>
                <path class="cline" pathLength="1" d="${path.line}" stroke="#4B3FD6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
              ${
                trend.length
                  ? `<span class="cring" style="position:absolute;left:${(path.last.x / 640) * 100}%;top:${(path.last.y / 210) * 100}%;width:12px;height:12px;border-radius:50%;background:#4B3FD6"></span>
                     <span class="cdot" style="position:absolute;left:${(path.last.x / 640) * 100}%;top:${(path.last.y / 210) * 100}%;width:12px;height:12px;border-radius:50%;background:#4B3FD6;border:3px solid #ffffff;box-sizing:border-box;box-shadow:0 2px 6px rgba(20,18,43,.25)"></span>
                     <span class="ctip" style="position:absolute;left:${(path.last.x / 640) * 100}%;top:${(path.last.y / 210) * 100}%;padding:6px 12px;border-radius:12px;background:#14122B;color:#ffffff;font-size:13px;font-weight:600;white-space:nowrap">${formatMoney(data.expense_minor, cur)}</span>`
                  : ""
              }
            </div>
            <div class="x-axis">${ticks.map((t) => `<span style="left:${t.left}%">${t.label}</span>`).join("")}</div>
          </div>
        </section>
        <section class="card cats-card rise" style="--i:6">
          <h2 style="margin:0;font-size:18px;font-weight:600">На что уходят деньги</h2>
          ${
            lead
              ? `<div class="donut-row">
                  <div class="donut">
                    <svg width="132" height="132" viewBox="0 0 160 160" fill="none" aria-hidden="true" style="transform:rotate(-90deg)">
                      <circle cx="80" cy="80" r="60" stroke="#EEECFA" stroke-width="22"></circle>
                      ${donut(data.categories)}
                    </svg>
                    <div class="donut-center"><strong>${data.category_count}</strong><span>категорий</span></div>
                  </div>
                  <div>
                    <div class="lead-pct">${String(lead.percent).replace(".", ",")}%</div>
                    <div class="kpi-foot" style="font-weight:500;line-height:1.4;margin-top:4px">${lead.name} — самая большая статья расходов</div>
                  </div>
                </div>
                <div class="cat-rows">
                  ${data.categories
                    .map(
                      (cat, i) => `<div class="trow cat-row" style="--i:${i}"><span class="swatch" style="background:${cat.color}${cat.color === "#B9AEFF" || cat.color === "#DDDAF0" ? ";box-shadow:inset 0 0 0 1px rgba(20,18,43,.15)" : ""}"></span><span style="flex:1">${cat.name}</span><span>${formatMoney(cat.amount_minor, cur)}</span><span style="width:48px;text-align:right;font-weight:500;color:#5E5B78;font-size:12.5px">${String(cat.percent).replace(".", ",")}%</span></div>`,
                    )
                    .join("")}
                </div>`
              : emptyState("Пока нет расходов", "Добавьте первую операцию, чтобы увидеть категории.")
          }
        </section>
      </div>
      <div class="bot-grid">
        <section class="card ops-card rise" style="--i:7">
          <div class="card-head" style="padding:0 6px"><h2>Последние операции</h2><a class="link" href="/operations" style="border:none;background:transparent;font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px">Все операции${icon("ext")}</a></div>
          <div class="ops-head"><span>ОПЕРАЦИЯ</span><span>ДАТА</span><span>КАТЕГОРИЯ</span><span style="text-align:right">СУММА</span></div>
          ${
            data.recent.length
              ? data.recent
                  .map((tx, i) => {
                    const plus = tx.type === "income";
                    const ico = ICON_MAP[tx.category_icon] || (plus ? "income" : "bag");
                    const sign = plus ? "+" : "−";
                    return `<div class="trow op-row" style="--i:${i}">
                      <div class="op-main"><span class="op-ico ${plus ? "income" : ""}">${icon(ico)}</span><span><span style="display:block;font-size:15px;font-weight:600">${tx.title}</span><span style="display:block;font-size:12.5px;font-weight:500;color:#5E5B78">${tx.account_name}</span></span></div>
                      <span style="font-size:14px;font-weight:500;color:#5E5B78">${formatDayShort(tx.occurred_on)}</span>
                      <span><span class="pill ${plus ? "income" : ""}">${plus ? "Доход" : tx.category_name || "—"}</span></span>
                      <span class="amt ${plus ? "plus" : ""}">${sign}${formatMoney(tx.amount_minor, cur)}</span>
                    </div>`;
                  })
                  .join("")
              : emptyState("Операций пока нет", "Здесь появятся ваши последние доходы и расходы.")
          }
        </section>
        <section class="card budget-card rise" style="--i:8">
          <div class="card-head"><h2>Бюджет на месяц</h2><a class="link" href="/budgets" style="border:none;background:transparent;font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px">Изменить${icon("ext")}</a></div>
          ${
            data.budget.limit_minor
              ? `<div>
                  <div style="display:flex;align-items:baseline;justify-content:space-between">
                    <span style="font-size:38px;font-weight:600;letter-spacing:-0.035em">${moneyHtml(data.budget.spent_minor, cur)}</span>
                    <span class="kpi-foot">из ${formatMoney(data.budget.limit_minor, cur)}</span>
                  </div>
                  <div class="bar"><span class="fw" style="--i:0;--w:${Math.min(data.budget.percent, 100)}%;width:${Math.min(data.budget.percent, 100)}%"></span></div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-top:8px"><span style="color:#5E5B78">Остаток ${formatMoney(data.budget.remaining_minor, cur)}</span><span>${data.budget.percent}%</span></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:12px">
                  ${data.budget.items
                    .slice(0, 2)
                    .map(
                      (item, i) => `<div>
                        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:600"><span>${item.name}</span><span style="font-weight:500;font-size:13px;color:#5E5B78">${formatCompact(item.spent_minor)} / ${formatMoney(item.limit_minor, cur)}</span></div>
                        <div style="display:flex;align-items:center;gap:10px;margin-top:6px"><div class="mini-bar"><span class="fw" style="--i:${i + 1};--w:${Math.min(item.percent, 100)}%;width:${Math.min(item.percent, 100)}%"></span></div><span style="font-size:12.5px;font-weight:600;color:#5E5B78;width:34px;text-align:right">${item.percent}%</span></div>
                      </div>`,
                    )
                    .join("")}
                </div>
                <div class="tip-box"><span style="width:30px;height:30px;border-radius:50%;background:#B9AEFF;display:flex;align-items:center;justify-content:center;flex:none">${icon("idea")}</span><span>${formatMoney(data.budget.daily_allowance_minor, cur)} в день до конца месяца, чтобы остаться в рамках бюджета.</span></div>`
              : emptyState("Бюджет не задан", "Укажите лимит на месяц в разделе «Бюджеты».")
          }
        </section>
      </div>
    </div>
    <div class="modal-back" id="modal" hidden>
      <form class="modal" id="expense-form">
        <h2>Новый расход</h2>
        <div class="row"><label class="sr-only" for="title">Название</label><input class="field" id="title" name="title" required placeholder="Название"></div>
        <div class="row"><label class="sr-only" for="amount">Сумма</label><input class="field" id="amount" name="amount" required inputmode="decimal" placeholder="Сумма"></div>
        <div class="row"><label class="sr-only" for="category">Категория</label><select class="field" id="category" name="category"></select></div>
        <div class="row"><label class="sr-only" for="when">Дата</label><input class="field" id="when" name="when" type="date" required></div>
        <p class="err" id="form-err"></p>
        <div class="modal-actions">
          <button class="ghost btn2" type="button" id="cancel-exp">Отмена</button>
          <button class="primary addbtn" type="submit">Сохранить</button>
        </div>
      </form>
    </div>
  `;
}

async function openModal() {
  const modal = document.getElementById("modal");
  const [accounts, categories] = await Promise.all([apiJson("/api/accounts"), apiJson("/api/categories")]);
  const select = document.getElementById("category");
  select.innerHTML = categories
    .filter((c) => c.kind === "expense")
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
  document.getElementById("when").value = new Date().toISOString().slice(0, 10);
  modal.dataset.accountId = accounts[0]?.id || "";
  modal.hidden = false;
  modal.classList.add("show");
  document.getElementById("title").focus();
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("show");
  modal.hidden = true;
}

async function submitExpense(event) {
  event.preventDefault();
  const modal = document.getElementById("modal");
  const title = document.getElementById("title").value.trim();
  const amount = Number(document.getElementById("amount").value.replace(",", "."));
  const err = document.getElementById("form-err");
  if (!amount || amount <= 0) {
    err.textContent = "Введите сумму больше нуля";
    return;
  }
  err.textContent = "";
  await apiJson("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      account_id: Number(modal.dataset.accountId),
      category_id: Number(document.getElementById("category").value),
      type: "expense",
      amount_minor: Math.round(amount * 100),
      occurred_on: document.getElementById("when").value,
      title,
    }),
  });
  closeModal();
  await load();
}

async function load() {
  const data = await apiJson(`/api/dashboard`);
  renderDashboard(data);
  document.getElementById("add-expense")?.addEventListener("click", openModal);
  document.getElementById("cancel-exp")?.addEventListener("click", closeModal);
  document.getElementById("expense-form")?.addEventListener("submit", submitExpense);
}

const me = await bootShell("home");
if (me) {
  pageRoot().innerHTML = `<div class="card skel" style="height:200px"></div>`;
  try {
    await load();
  } catch {
    pageRoot().innerHTML = emptyState("Не удалось загрузить обзор", "Проверьте соединение и обновите страницу.");
  }
}
