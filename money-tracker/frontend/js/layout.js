import { api, ensureSession } from "./api.js";
import { formatDateLong } from "./format.js";
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
  renderShell(pageId, me);
  return me;
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
          <span style="display:flex;align-items:center;gap:10px"><span style="width:8px;height:8px;border-radius:50%;background:#B9AEFF"></span>Личные финансы</span>
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
              <span style="display:block;color:#ffffff;font-weight:600;font-size:14px">${me.name}</span>
              <span style="display:block;color:rgba(255,255,255,.6);font-weight:500;font-size:12.5px">Личный аккаунт</span>
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
            <button class="icon-btn btn2" type="button" aria-label="Уведомления">${icon("bell")}<span class="dot-note"></span></button>
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
}

export function pageRoot() {
  return document.getElementById("page");
}

export function emptyState(title, text) {
  return `<div class="card empty inup"><h2>${title}</h2><p>${text}</p></div>`;
}
