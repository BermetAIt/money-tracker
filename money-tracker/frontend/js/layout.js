import { api, apiJson, ensureSession } from "./api.js";
import { formatDateLong, formatMoney } from "./format.js";
import { icon } from "./icons.js";

const NAV = [
  { id: "home", href: "/", label: "Главная", icon: "home", crumb: "Обзор" },
  { id: "ops", href: "/operations", label: "Операции", icon: "ops", crumb: "Операции" },
  { id: "ana", href: "/analytics", label: "Аналитика", icon: "ana", crumb: "Аналитика" },
  { id: "bud", href: "/budgets", label: "Бюджеты", icon: "bud", crumb: "Бюджеты" },
  { id: "acc", href: "/accounts", label: "Счета", icon: "acc", crumb: "Счета" },
  { id: "ai", href: "/assistant", label: "ИИ-помощник", icon: "ai", crumb: "ИИ-помощник", badge: "New" },
];

export async function bootShell(pageId) {
  const ok = await ensureSession();
  if (!ok) {
    window.location.href = "/login";
    return null;
  }
  const meRes = await api("/api/auth/me");
  if (!meRes.ok) {
    window.location.href = "/login";
    return null;
  }
  const me = await meRes.json();
  applyStoredAppearance(me.id);
  renderShell(pageId, me);
  return me;
}

function applyStoredAppearance(userId) {
  try {
    const preferences = JSON.parse(localStorage.getItem(`money-tracker-settings-${userId}`) || "{}");
    const theme = preferences.theme || "light";
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    if (/^#[0-9A-Fa-f]{6}$/.test(preferences.accent_color || "")) {
      document.documentElement.style.setProperty("--color-purple", preferences.accent_color);
      document.documentElement.style.setProperty(
        "--color-lavender",
        `color-mix(in srgb, ${preferences.accent_color} 42%, var(--color-accent-tint-base))`,
      );
    }
  } catch {
    document.documentElement.dataset.theme = "light";
  }
}

function renderShell(pageId, me) {
  const page = [...NAV, { id: "set", crumb: "Настройки" }, { id: "help", crumb: "Помощь" }, { id: "profile", crumb: "Профиль" }].find(
    (item) => item.id === pageId,
  );
  const index = Math.max(0, NAV.findIndex((item) => item.id === pageId));
  const navY = index * 52;
  document.body.innerHTML = `
    <div class="shell">
      <div class="backdrop" id="backdrop"></div>
      <aside class="sidebar sb" id="sidebar">
        <div class="brand">
          <div class="brand-mark">${icon("wallet")}</div>
          <span class="brand-name">Money Tracker</span>
        </div>
        <button class="side space-btn" type="button" aria-label="Выбрать пространство: Личные финансы">
          <span style="display:flex;align-items:center;gap:10px"><span class="space-dot"></span>Личные финансы</span>
          ${icon("swap")}
        </button>
        <div class="nav-label">ВАШИ ФИНАНСЫ</div>
        <nav class="nav-wrap" aria-label="Разделы">
          <span class="navpill" style="transform:translateY(${pageId && NAV.some((n) => n.id === pageId) ? navY : -80}px)"></span>
          ${NAV.map((item) => `
            <a class="nav ${item.id === pageId ? "on" : ""}" href="${item.href}" ${item.id === pageId ? 'aria-current="page"' : ""}>
              ${icon(item.icon)}${item.label}${item.badge ? `<span class="nbadge">${item.badge}</span>` : ""}
            </a>`).join("")}
        </nav>
        <div style="flex:1"></div>
        <div class="habit">
          ${icon("spark")}
          <strong>Маленькие привычки. Большие планы.</strong>
          <span>Записывайте расходы, чтобы видеть больше возможностей.</span>
        </div>
        <a class="side ${pageId === "set" ? "on" : ""}" href="/settings">${icon("set")}Настройки</a>
        <a class="side ${pageId === "help" ? "on" : ""}" href="/help">${icon("help")}Помощь</a>
        <a class="side profile-btn" href="/profile" aria-label="Профиль: ${me.name}">
          <span style="display:flex;align-items:center;gap:10px;text-align:left">
            <span class="avatar">${me.initials}</span>
            <span>
              <span class="profile-name">${me.name}</span>
              <span class="profile-caption">Личный аккаунт</span>
            </span>
          </span>
          ${icon("chev")}
        </a>
      </aside>
      <main class="main">
        <div class="topbar rise" style="--i:0">
          <div style="display:flex;align-items:center;gap:10px">
            <button class="menu-toggle btn2" id="menu-toggle" type="button" aria-label="Открыть меню">${icon("home")}</button>
            <div class="crumb"><span>Личные финансы</span>${icon("arrow")}<strong>${page?.crumb || "Обзор"}</strong></div>
          </div>
          <div class="top-meta">
            <span>${formatDateLong()}</span>
            <div class="notification-wrap" id="notification-wrap">
              <button class="icon-btn btn2 notification-toggle" id="notification-toggle" type="button" aria-label="Уведомления" aria-expanded="false" aria-controls="notification-panel">
                ${icon("bell")}<span class="notification-badge" id="notification-badge" hidden></span>
              </button>
              <section class="notification-panel" id="notification-panel" aria-label="Уведомления" hidden>
                <div class="notification-panel-head"><strong>Уведомления</strong><span id="notification-count"></span></div>
                <div class="notification-list" id="notification-list" aria-live="polite">
                  <p class="notification-empty">Проверяем лимиты бюджета…</p>
                </div>
              </section>
            </div>
          </div>
        </div>
        <div id="page"></div>
      </main>
    </div>
  `;
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  document.getElementById("menu-toggle")?.addEventListener("click", () => {
    sidebar.classList.add("open");
    backdrop.classList.add("show");
  });
  backdrop.addEventListener("click", () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
  });
  setupNotifications(me.currency || "KGS");
}

function setupNotifications(currency) {
  const toggle = document.getElementById("notification-toggle");
  const panel = document.getElementById("notification-panel");
  const list = document.getElementById("notification-list");
  const count = document.getElementById("notification-count");
  const badge = document.getElementById("notification-badge");
  let loading = false;
  let loadError = false;

  function renderNotifications(notifications) {
    count.textContent = notifications.length
      ? `${notifications.length} ${notifications.length === 1 ? "новое" : "активных"}`
      : "";
    badge.hidden = notifications.length === 0;
    badge.textContent = notifications.length > 9 ? "9+" : String(notifications.length);
    toggle.setAttribute(
      "aria-label",
      notifications.length ? `Уведомления: ${notifications.length} превышенных лимита` : "Уведомления",
    );
    if (!notifications.length) {
      list.innerHTML = `<p class="notification-empty">Нет превышенных лимитов. Здесь появятся уведомления, если расходы выйдут за бюджет.</p>`;
      return;
    }

    list.replaceChildren(
      ...notifications.map((notification) => {
        const item = document.createElement("article");
        item.className = "notification-item";
        const title = document.createElement("strong");
        title.textContent = notification.category_name
          ? `Превышен лимит: ${notification.category_name}`
          : "Превышен общий бюджет";
        const details = document.createElement("p");
        details.textContent = `Потрачено ${formatMoney(notification.spent_minor, currency)} из ${formatMoney(notification.limit_minor, currency)}. Превышение — ${formatMoney(notification.exceeded_minor, currency)}.`;
        const date = document.createElement("span");
        date.className = "notification-item-date";
        date.textContent = new Intl.DateTimeFormat("ru-RU", {
          month: "long",
          year: "numeric",
        }).format(new Date(notification.year, notification.month - 1, 1));
        item.append(title, details, date);
        return item;
      }),
    );
  }

  async function loadNotifications() {
    if (loading) return;
    loading = true;
    loadError = false;
    try {
      renderNotifications(await apiJson("/api/notifications"));
      toggle.removeAttribute("title");
    } catch (error) {
      loadError = true;
      toggle.title = error.message || "Не удалось загрузить уведомления";
      list.innerHTML = `<p class="notification-empty is-error">Не удалось загрузить уведомления. Нажмите на колокольчик, чтобы повторить.</p>`;
    } finally {
      loading = false;
    }
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open && loadError) loadNotifications();
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !event.target.closest("#notification-wrap")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  loadNotifications();
}

export function pageRoot() {
  return document.getElementById("page");
}

export function emptyState(title, text) {
  return `<div class="card empty inup"><h2>${title}</h2><p>${text}</p></div>`;
}
