import { apiJson } from "./api.js";
import { formatDateLong, formatMoney, currentMonthKey } from "./format.js";
import { icon } from "./icons.js?v=2";
import { bootShell, pageRoot } from "./layout.js?v=3";

const user = await bootShell("profile");

if (user) {
  const root = pageRoot();
  try {
    const [transactions, accounts, budgets] = await Promise.all([
      apiJson("/api/transactions"),
      apiJson("/api/accounts"),
      apiJson(`/api/budgets?month=${currentMonthKey()}`),
    ]);
    renderProfile(root, user, transactions, accounts, budgets);
  } catch (error) {
    root.innerHTML = `
      <section class="card profile-load-error" role="alert">
        <h1>Не удалось загрузить профиль</h1>
        <p>${escapeHtml(error.message || "Проверьте соединение и попробуйте ещё раз.")}</p>
        <button class="primary btn2" id="profile-retry" type="button">Повторить</button>
      </section>
    `;
    root.querySelector("#profile-retry").addEventListener("click", () => window.location.reload());
  }
}

function renderProfile(root, profile, transactions, accounts, budgets) {
  const joinedDate = new Date(profile.created_at);
  const hasJoinedDate = !Number.isNaN(joinedDate.getTime());
  const daysInApp = hasJoinedDate ? daysSince(joinedDate) : null;
  const joinedLabel = hasJoinedDate
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(joinedDate)
    : "Дата регистрации недоступна";
  const income = sumTransactions(transactions, "income");
  const expenses = sumTransactions(transactions, "expense");
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : null;
  const activeDays = new Set(transactions.map((transaction) => transaction.occurred_on)).size;
  const achievements = [
    {
      icon: "ops",
      title: "Первая запись",
      description: "Добавьте первую операцию",
      earned: transactions.length > 0,
      href: "/operations",
    },
    {
      icon: "ops",
      title: "10 операций",
      description: "Запишите десять операций",
      earned: transactions.length >= 10,
      href: "/operations",
    },
    {
      icon: "ana",
      title: "50 операций",
      description: "Запишите пятьдесят операций",
      earned: transactions.length >= 50,
      href: "/operations",
    },
    {
      icon: "cal",
      title: "Неделя активности",
      description: "Записывайте операции в разные дни",
      earned: activeDays >= 7,
      href: "/operations",
    },
    {
      icon: "bud",
      title: "Бюджет на месяц",
      description: "Создайте бюджет на текущий месяц",
      earned: budgets.length > 0,
      href: "/budgets",
    },
    {
      icon: "idea",
      title: "Накопительный счёт",
      description: "Добавьте счёт типа «Копилка»",
      earned: accounts.some((account) => account.type === "savings"),
      href: "/accounts",
    },
  ];
  const earnedCount = achievements.filter((achievement) => achievement.earned).length;
  const savingsAccounts = accounts.filter((account) => account.type === "savings");

  root.innerHTML = `
    <div class="profile-page">
      <section class="profile-hero inup" aria-labelledby="profile-title">
        <div class="profile-hero-main">
          <div class="profile-avatar" aria-hidden="true">${escapeHtml(profile.initials)}</div>
          <div class="profile-identity">
            <p>Личный профиль · с ${escapeHtml(joinedLabel)}</p>
            <h1 id="profile-title">${escapeHtml(profile.name)}</h1>
            <span>${escapeHtml(profile.email)}</span>
          </div>
          <div class="profile-hero-actions">
            <a class="profile-button profile-button-light" href="/settings">${icon("edit")}Редактировать</a>
            <button class="profile-button profile-button-quiet" id="profile-logout" type="button">
              ${logoutIcon()}Выйти
            </button>
          </div>
        </div>
        <div class="profile-metrics" aria-label="Статистика профиля">
          <div class="profile-metric">
            <strong>${daysInApp ?? "—"}</strong>
            <span>дней с нами</span>
          </div>
          <div class="profile-metric">
            <strong>${transactions.length}</strong>
            <span>операций записано</span>
          </div>
          <div class="profile-metric">
            <strong>${formatPercent(savingsRate)}</strong>
            <span>доля сбережений</span>
          </div>
          <div class="profile-metric">
            <strong>${earnedCount} из ${achievements.length}</strong>
            <span>достижений</span>
          </div>
        </div>
      </section>

      <div class="profile-overview-grid">
        <section class="card profile-card profile-personal" aria-labelledby="profile-personal-title">
          <div class="profile-card-head">
            <div>
              <h2 id="profile-personal-title">Личные данные</h2>
              <p>Информация вашего аккаунта</p>
            </div>
            <a class="profile-text-link" href="/settings">Изменить</a>
          </div>
          <dl class="profile-details">
            <div><dt>Имя и фамилия</dt><dd>${escapeHtml(profile.name)}</dd></div>
            <div><dt>Электронная почта</dt><dd>${escapeHtml(profile.email)}</dd></div>
            <div><dt>В приложении с</dt><dd>${escapeHtml(joinedLabel)}</dd></div>
            <div><dt>Валюта</dt><dd>${escapeHtml(profile.currency)}</dd></div>
          </dl>
        </section>

        <section class="card profile-card profile-achievements" aria-labelledby="profile-achievements-title">
          <div class="profile-card-head">
            <div>
              <h2 id="profile-achievements-title">Достижения</h2>
              <p>Отмечайте полезные финансовые привычки</p>
            </div>
            <span class="profile-card-count">${earnedCount} из ${achievements.length}</span>
          </div>
          <div class="profile-achievement-grid">
            ${achievements
              .map(
                (achievement) => `
                  <a class="profile-achievement ${achievement.earned ? "is-earned" : ""}" href="${achievement.href}">
                    <span class="profile-achievement-icon">${icon(achievement.icon)}</span>
                    <span class="profile-achievement-copy">
                      <strong>${escapeHtml(achievement.title)}</strong>
                      <small>${escapeHtml(achievement.earned ? "Получено" : achievement.description)}</small>
                    </span>
                  </a>
                `,
              )
              .join("")}
          </div>
        </section>

        <section class="card profile-card profile-security" aria-labelledby="profile-security-title">
          <div class="profile-card-head">
            <div>
              <h2 id="profile-security-title">Безопасность</h2>
              <p>Управление доступом к аккаунту</p>
            </div>
          </div>
          <div class="profile-security-row">
            <span class="profile-security-icon">${icon("set")}</span>
            <span><strong>Пароль аккаунта</strong><small>Изменяйте его в настройках</small></span>
          </div>
          <a class="profile-settings-link" href="/settings">Перейти к настройкам ${icon("arrow")}</a>
          <p class="profile-logout-status" id="profile-logout-status" role="status" aria-live="polite"></p>
        </section>
      </div>

      <div class="profile-lower-grid">
        <section class="card profile-card profile-savings" aria-labelledby="profile-savings-title">
          <div class="profile-card-head">
            <div>
              <h2 id="profile-savings-title">Накопительные счета</h2>
              <p>Счета, которые вы используете для накоплений</p>
            </div>
            <a class="profile-text-link" href="/accounts">Все счета ${icon("arrow")}</a>
          </div>
          ${
            savingsAccounts.length
              ? `<div class="profile-savings-list">${savingsAccounts.map(renderSavingsAccount).join("")}</div>`
              : `<div class="profile-empty">
                  <span class="profile-empty-icon">${icon("idea")}</span>
                  <div><strong>Пока нет накопительных счетов</strong><p>Создайте счёт типа «Копилка» в разделе «Счета».</p></div>
                  <a class="profile-empty-action" href="/accounts" aria-label="Перейти к счетам">${icon("arrow")}</a>
                </div>`
          }
        </section>

        <section class="card profile-card profile-activity" aria-labelledby="profile-activity-title">
          <div class="profile-card-head">
            <div>
              <h2 id="profile-activity-title">Активность</h2>
              <p>Операции за последние 12 недель</p>
            </div>
          </div>
          <div class="profile-activity-chart">
            <div class="profile-week-labels" aria-hidden="true"><span>Пн</span><span>Ср</span><span>Пт</span></div>
            <div class="profile-activity-grid" role="img" aria-label="Календарь операций за последние 12 недель">
              ${renderActivityGrid(transactions)}
            </div>
          </div>
          <div class="profile-activity-legend"><span>Меньше</span><i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><span>Больше</span></div>
        </section>
      </div>
    </div>
  `;

  root.querySelector("#profile-logout").addEventListener("click", logout);
}

function renderSavingsAccount(account) {
  const balance = Math.max(0, Number(account.balance_minor) || 0);
  const target = Math.max(0, Number(account.goal_amount_minor) || 0);
  const progress = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : null;
  return `
    <article class="profile-savings-item">
      <span class="profile-savings-icon">${icon("wallet")}</span>
      <div class="profile-savings-main">
        <div class="profile-savings-title"><strong>${escapeHtml(account.name)}</strong><span>${formatMoney(balance, account.currency)}</span></div>
        ${
          progress === null
            ? `<small>Накопительный счёт</small>`
            : `<div class="profile-savings-progress" role="progressbar" aria-label="${escapeHtml(account.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
                <span style="width:${progress}%"></span>
              </div><small>${formatMoney(balance, account.currency)} из ${formatMoney(target, account.currency)} · ${progress}%</small>`
        }
      </div>
    </article>
  `;
}

function renderActivityGrid(transactions) {
  const counts = new Map();
  for (const transaction of transactions) {
    counts.set(transaction.occurred_on, (counts.get(transaction.occurred_on) || 0) + 1);
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const weekdayFromMonday = (new Date(todayUtc).getUTCDay() + 6) % 7;
  const startUtc = todayUtc - (11 * 7 + weekdayFromMonday) * 24 * 60 * 60 * 1000;
  const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

  return Array.from({ length: 84 }, (_, index) => {
    const date = new Date(startUtc + index * 24 * 60 * 60 * 1000);
    const day = date.toISOString().slice(0, 10);
    const count = counts.get(day) || 0;
    const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
    const description = count ? `${count} ${pluralize(count, "операция", "операции", "операций")}` : "Нет операций";
    const label = `${description} · ${dateLabel.format(date)}`;
    return `<span class="profile-activity-cell" data-level="${level}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`;
  }).join("");
}

async function logout() {
  const button = document.getElementById("profile-logout");
  const status = document.getElementById("profile-logout-status");
  button.disabled = true;
  status.textContent = "Завершаем сеанс…";
  try {
    await apiJson("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  } catch (error) {
    button.disabled = false;
    status.textContent = error.message || "Не удалось завершить сеанс.";
  }
}

function sumTransactions(transactions, type) {
  return transactions.reduce(
    (total, transaction) => total + (transaction.type === type ? Number(transaction.amount_minor) || 0 : 0),
    0,
  );
}

function daysSince(date) {
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const joinedUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((todayUtc - joinedUtc) / (24 * 60 * 60 * 1000)) + 1);
}

function formatPercent(value) {
  return value === null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function pluralize(count, one, few, many) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function logoutIcon() {
  return `<svg class="profile-logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"></path><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"></path></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
