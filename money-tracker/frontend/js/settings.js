import { apiJson } from "./api.js";
import { icon } from "./icons.js";
import { bootShell, pageRoot } from "./layout.js";

const ACCENTS = ["#6D5DFB", "#0E7A5F", "#D7424A", "#C78800"];
const CURRENCIES = [
  { code: "KGS", label: "Сом", symbol: "⃀" },
  { code: "RUB", label: "Рубль", symbol: "₽" },
  { code: "USD", label: "Доллар", symbol: "$" },
  { code: "EUR", label: "Евро", symbol: "€" },
];

let user;
let saved;
let photoUrl = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function storageKey() {
  return `money-tracker-settings-${user.id}`;
}

function readLocalSettings() {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) || "{}");
  } catch {
    return {};
  }
}

function applyTheme(theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
}

function applyAccent(color) {
  document.documentElement.style.setProperty("--color-purple", color);
  document.documentElement.style.setProperty("--color-lavender", `color-mix(in srgb, ${color} 42%, white)`);
}

function setStatus(message, isError = false) {
  const status = document.getElementById("settings-status");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function currentFormSettings() {
  const checked = (name) => document.querySelector(`[name="${name}"]`)?.checked || false;
  return {
    theme: document.querySelector("[data-theme-choice].is-selected")?.dataset.themeChoice || saved.theme,
    accent_color: document.querySelector("[data-accent].is-selected")?.dataset.accent || saved.accent_color,
    currency: document.querySelector("[data-currency].is-selected")?.dataset.currency || saved.currency,
    weekStart: document.getElementById("week-start").value,
    language: document.getElementById("language").value,
    notifyBudget: checked("notify-budget"),
    notifyWeekly: checked("notify-weekly"),
    notifyReminder: checked("notify-reminder"),
    notifyAssistant: checked("notify-assistant"),
  };
}

function selectButton(selector, attribute, value) {
  document.querySelectorAll(selector).forEach((button) => {
    const selected = button.dataset[attribute] === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function renderSettings() {
  const profileName = user.name;
  const profileEmail = user.email;
  const createdDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(),
  );
  const currency = saved.currency || user.currency || "KGS";

  pageRoot().innerHTML = `
    <div class="settings-page">
      <header class="page-head settings-head inup" style="--i:1">
        <div>
          <h1>Настройки</h1>
          <p>Профиль, внешний вид, валюта и уведомления.</p>
        </div>
        <button class="primary btn2 settings-save" id="settings-save" type="button">Сохранить</button>
      </header>
      <p class="settings-status" id="settings-status" role="status" aria-live="polite"></p>
      <div class="settings-grid">
        <div class="settings-column">
          <section class="card settings-card profile-card rise" style="--i:2">
            <h2>Профиль</h2>
            <div class="profile-summary">
              <span class="settings-avatar" id="profile-avatar">${escapeHtml(user.initials)}</span>
              <div class="profile-identity">
                <strong id="profile-name">${escapeHtml(profileName)}</strong>
                <span>Личный аккаунт · с ${createdDate}</span>
              </div>
              <label class="photo-button btn2" for="profile-photo">${icon("edit")} Фото</label>
              <input class="sr-only" id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp">
            </div>
            <label class="settings-label" for="profile-name-input">Имя</label>
            <input class="field settings-field" id="profile-name-input" name="profile-name" type="text" maxlength="80" value="${escapeHtml(profileName)}" autocomplete="name" required>
            <label class="settings-label" for="profile-email-input">Электронная почта</label>
            <input class="field settings-field" id="profile-email-input" name="profile-email" type="email" maxlength="255" value="${escapeHtml(profileEmail)}" autocomplete="email" required>
          </section>

          <section class="card settings-card appearance-card rise" style="--i:3">
            <h2>Внешний вид</h2>
            <div class="theme-options" role="group" aria-label="Тема оформления">
              <button class="theme-option" type="button" data-theme-choice="light" aria-pressed="false">
                <span class="theme-preview theme-preview-light"><i></i><b></b><em></em><small></small></span>
                <span>Светлая</span>
              </button>
              <button class="theme-option" type="button" data-theme-choice="dark" aria-pressed="false">
                <span class="theme-preview theme-preview-dark"><i></i><b></b><em></em><small></small></span>
                <span>Тёмная</span>
              </button>
              <button class="theme-option" type="button" data-theme-choice="system" aria-pressed="false">
                <span class="theme-preview theme-preview-system"><i></i><b></b><em></em><small></small></span>
                <span>Как в системе</span>
              </button>
            </div>
            <span class="settings-label">Акцентный цвет</span>
            <div class="accent-options" role="group" aria-label="Акцентный цвет">
              ${ACCENTS.map(
                (color, index) =>
                  `<button class="accent-swatch" type="button" data-accent="${color}" style="--swatch:${color}" aria-label="Цвет ${index + 1}" aria-pressed="false"></button>`,
              ).join("")}
            </div>
            <div class="settings-preview-action">
              <span>Так будет выглядеть главная кнопка</span>
              <button class="preview-add" type="button">${icon("plus")}Добавить расход</button>
            </div>
          </section>
        </div>

        <div class="settings-column">
          <section class="card settings-card format-card rise" style="--i:2">
            <h2>Валюта и формат</h2>
            <div class="currency-options" role="group" aria-label="Валюта">
              ${CURRENCIES.map(
                (item) =>
                  `<button class="currency-option" type="button" data-currency="${item.code}" aria-pressed="false">${item.symbol} ${item.label}</button>`,
              ).join("")}
            </div>
            <div class="amount-example"><span>Пример суммы</span><strong>151 400 <span id="currency-preview">${icon("wallet")}</span></strong></div>
            <div class="settings-select-row">
              <label for="week-start">Первый день недели</label>
              <select id="week-start" class="settings-select"><option value="monday">Понедельник</option><option value="sunday">Воскресенье</option></select>
            </div>
            <div class="settings-select-row">
              <label for="language">Язык</label>
              <select id="language" class="settings-select"><option value="ru">Русский</option></select>
            </div>
          </section>

          <section class="card settings-card notifications-card rise" style="--i:3">
            <h2>Уведомления</h2>
            <label class="notification-row">
              <span><strong>Лимит бюджета почти исчерпан</strong><small>Сообщим, когда потрачено 80% категории</small></span>
              <input type="checkbox" name="notify-budget"><i class="toggle"></i>
            </label>
            <label class="notification-row">
              <span><strong>Недельный итог</strong><small>Каждый понедельник в 9:00</small></span>
              <input type="checkbox" name="notify-weekly"><i class="toggle"></i>
            </label>
            <label class="notification-row">
              <span><strong>Напоминание записать расходы</strong><small>Каждый вечер в 21:00</small></span>
              <input type="checkbox" name="notify-reminder"><i class="toggle"></i>
            </label>
            <label class="notification-row">
              <span><strong>Советы ИИ-помощника</strong><small>Короткие подсказки по вашим тратам</small></span>
              <input type="checkbox" name="notify-assistant"><i class="toggle"></i>
            </label>
          </section>

          <section class="card settings-card security-card rise" style="--i:4">
            <h2>Данные и безопасность</h2>
            <div class="security-actions">
              <button class="security-button btn2" id="export-data" type="button">${icon("download")} Экспорт CSV</button>
              <button class="security-button btn2" id="change-password" type="button">${icon("set")} Сменить пароль</button>
            </div>
            <div class="delete-warning">
              <span>Удаление аккаунта сотрёт все операции без возможности вернуть.</span>
              <button class="delete-button" id="delete-account" type="button">Удалить</button>
            </div>
          </section>
        </div>
      </div>
    </div>
    <dialog class="settings-dialog" id="settings-dialog">
      <form method="dialog" class="dialog-close-form"><button class="dialog-close" aria-label="Закрыть" value="cancel">×</button></form>
      <div id="dialog-content"></div>
    </dialog>
  `;

  selectButton("[data-theme-choice]", "themeChoice", saved.theme);
  selectButton("[data-accent]", "accent", saved.accent_color);
  selectButton("[data-currency]", "currency", currency);
  document.getElementById("week-start").value = saved.weekStart || "monday";
  document.getElementById("language").value = saved.language || "ru";
  document.querySelector('[name="notify-budget"]').checked = saved.notifyBudget ?? saved.notifications_email ?? true;
  document.querySelector('[name="notify-weekly"]').checked = saved.notifyWeekly ?? saved.notifications_push ?? true;
  document.querySelector('[name="notify-reminder"]').checked = saved.notifyReminder ?? false;
  document.querySelector('[name="notify-assistant"]').checked = saved.notifyAssistant ?? true;
  document.getElementById("currency-preview").textContent =
    CURRENCIES.find((item) => item.code === currency)?.symbol || "⃀";
  applyTheme(saved.theme);
  applyAccent(saved.accent_color);
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      selectButton("[data-theme-choice]", "themeChoice", button.dataset.themeChoice);
      applyTheme(button.dataset.themeChoice);
    });
  });
  document.querySelectorAll("[data-accent]").forEach((button) => {
    button.addEventListener("click", () => {
      selectButton("[data-accent]", "accent", button.dataset.accent);
      applyAccent(button.dataset.accent);
    });
  });
  document.querySelectorAll("[data-currency]").forEach((button) => {
    button.addEventListener("click", () => {
      selectButton("[data-currency]", "currency", button.dataset.currency);
      document.getElementById("currency-preview").textContent =
        CURRENCIES.find((item) => item.code === button.dataset.currency)?.symbol || "";
    });
  });

  document.getElementById("profile-photo").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setStatus("Размер фотографии не должен превышать 2 МБ.", true);
      event.target.value = "";
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(file);
    const avatar = document.getElementById("profile-avatar");
    avatar.style.backgroundImage = `url("${photoUrl}")`;
    avatar.classList.add("has-photo");
  });

  document.getElementById("settings-save").addEventListener("click", saveSettings);
  document.getElementById("export-data").addEventListener("click", exportCsv);
  document.getElementById("change-password").addEventListener("click", showPasswordDialog);
  document.getElementById("delete-account").addEventListener("click", showDeleteDialog);
}

async function saveSettings() {
  const saveButton = document.getElementById("settings-save");
  const name = document.getElementById("profile-name-input").value.trim();
  const email = document.getElementById("profile-email-input").value.trim();
  if (name.length < 2 || !document.getElementById("profile-email-input").checkValidity()) {
    setStatus("Проверьте имя и адрес электронной почты.", true);
    return;
  }

  saveButton.disabled = true;
  setStatus("Сохраняем изменения…");
  const preferences = currentFormSettings();
  try {
    const [profile, serverSettings] = await Promise.all([
      apiJson("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name, email }),
      }),
      apiJson("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          theme: preferences.theme,
          accent_color: preferences.accent_color,
          currency: preferences.currency,
          notifications_email: preferences.notifyBudget,
          notifications_push: preferences.notifyWeekly,
        }),
      }),
    ]);
    user = { ...user, ...profile };
    saved = { ...preferences, ...serverSettings };
    localStorage.setItem(storageKey(), JSON.stringify(saved));
    document.getElementById("profile-name").textContent = name;
    setStatus("Настройки сохранены.");
  } catch (error) {
    setStatus(error.message || "Не удалось сохранить настройки. Попробуйте ещё раз.", true);
  } finally {
    saveButton.disabled = false;
  }
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv() {
  const button = document.getElementById("export-data");
  button.disabled = true;
  setStatus("Готовим файл экспорта…");
  try {
    const transactions = await apiJson("/api/transactions");
    const rows = [
      ["Дата", "Тип", "Сумма", "Описание", "Категория", "Счёт"],
      ...transactions.map((transaction) => [
        transaction.occurred_on,
        transaction.type,
        (transaction.amount_minor / 100).toFixed(2),
        transaction.title,
        transaction.category_name || "",
        transaction.account_name,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "money-tracker-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Экспорт готов: файл CSV скачан.");
  } catch (error) {
    setStatus(error.message || "Не удалось экспортировать операции.", true);
  } finally {
    button.disabled = false;
  }
}

function showPasswordDialog() {
  const dialog = document.getElementById("settings-dialog");
  document.getElementById("dialog-content").innerHTML = `
    <h2>Сменить пароль</h2>
    <form id="password-form" class="dialog-form">
      <label for="current-password">Текущий пароль</label>
      <input class="field dialog-field" id="current-password" type="password" autocomplete="current-password" required>
      <label for="new-password">Новый пароль</label>
      <input class="field dialog-field" id="new-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required>
      <label for="confirm-password">Повторите новый пароль</label>
      <input class="field dialog-field" id="confirm-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required>
      <p class="dialog-error" id="password-error" role="alert"></p>
      <button class="primary dialog-action" type="submit">Сохранить пароль</button>
    </form>
  `;
  dialog.showModal();
  document.getElementById("password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const newPassword = document.getElementById("new-password").value;
    const error = document.getElementById("password-error");
    if (!form.reportValidity()) return;
    if (newPassword !== document.getElementById("confirm-password").value) {
      error.textContent = "Новые пароли не совпадают.";
      return;
    }
    try {
      await apiJson("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: document.getElementById("current-password").value,
          new_password: newPassword,
        }),
      });
      dialog.close();
      setStatus("Пароль изменён.");
    } catch (requestError) {
      error.textContent = requestError.message || "Не удалось изменить пароль.";
    }
  });
}

function showDeleteDialog() {
  const dialog = document.getElementById("settings-dialog");
  document.getElementById("dialog-content").innerHTML = `
    <h2>Удалить аккаунт?</h2>
    <p>Профиль и все операции будут удалены без возможности восстановления. Для подтверждения введите пароль и адрес почты.</p>
    <form id="delete-account-form" class="dialog-form">
      <label for="delete-password">Пароль</label>
      <input class="field dialog-field" id="delete-password" type="password" autocomplete="current-password" required>
      <label for="delete-email">Электронная почта: ${escapeHtml(user.email)}</label>
      <input class="field dialog-field" id="delete-email" type="email" autocomplete="email" required>
      <p class="dialog-error" id="delete-error" role="alert"></p>
      <button class="delete-confirm" type="submit">Удалить аккаунт</button>
    </form>
  `;
  dialog.showModal();
  document.getElementById("delete-account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const error = document.getElementById("delete-error");
    try {
      await apiJson("/api/auth/me", {
        method: "DELETE",
        body: JSON.stringify({
          password: document.getElementById("delete-password").value,
          confirmation: document.getElementById("delete-email").value,
        }),
      });
      localStorage.removeItem(storageKey());
      window.location.href = "/login";
    } catch (requestError) {
      error.textContent = requestError.message || "Не удалось удалить аккаунт.";
    }
  });
}

async function init() {
  user = await bootShell("set");
  if (!user) return;

  try {
    const remote = await apiJson("/api/settings");
    saved = { ...readLocalSettings(), ...remote };
  } catch (error) {
    saved = {
      ...readLocalSettings(),
      currency: user.currency || "KGS",
      theme: "light",
      accent_color: ACCENTS[0],
      notifications_email: true,
      notifications_push: false,
    };
    renderSettings();
    setStatus(error.message || "Не удалось загрузить сохранённые настройки.", true);
    return;
  }
  saved.theme ||= "light";
  saved.accent_color ||= ACCENTS[0];
  saved.currency ||= user.currency || "KGS";
  renderSettings();
}

init();
