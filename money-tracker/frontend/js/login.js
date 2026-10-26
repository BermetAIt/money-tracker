import { apiJson, setToken } from "./api.js";

const form = document.getElementById("login-form");
const card = document.querySelector(".auth-card");
const email = document.getElementById("email");
const password = document.getElementById("password");
const err = document.getElementById("err");
const submit = document.getElementById("login-submit");
let authenticated = false;

function clearError() {
  err.textContent = "";
  form.querySelectorAll(".field").forEach((field) => {
    field.classList.remove("is-invalid");
    field.removeAttribute("aria-invalid");
  });
}

function shakeCard() {
  card.classList.remove("auth-shake");
  requestAnimationFrame(() => card.classList.add("auth-shake"));
}

function showError(message, fields = []) {
  err.textContent = message;
  fields.forEach((field) => {
    field.classList.add("is-invalid");
    field.setAttribute("aria-invalid", "true");
  });
  shakeCard();
}

function setButtonLoading(loading) {
  submit.disabled = loading;
  submit.innerHTML = loading
    ? '<span class="auth-spinner" aria-hidden="true"></span><span class="auth-submit-label">Входим…</span>'
    : '<span class="auth-submit-label">Войти</span>';
}

function showSuccess() {
  authenticated = true;
  submit.disabled = false;
  submit.classList.add("is-success");
  submit.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="auth-check" d="m5 12 4 4L19 6"></path></svg><span class="auth-submit-label">Открыть приложение</span>';
}

form.addEventListener("input", (event) => {
  event.target.classList.remove("is-invalid");
  event.target.removeAttribute("aria-invalid");
  if (!form.querySelector(".field.is-invalid")) err.textContent = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authenticated) {
    window.location.href = "/";
    return;
  }
  clearError();

  const invalid = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) invalid.push(email);
  if (!password.value) invalid.push(password);
  if (invalid.length) {
    showError("Проверьте электронную почту и пароль.", invalid);
    return;
  }

  setButtonLoading(true);
  try {
    const data = await apiJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: email.value.trim(),
        password: password.value,
        remember_me: document.getElementById("remember").checked,
      }),
    });
    setToken(data.access_token);
    showSuccess();
  } catch (error) {
    setButtonLoading(false);
    const fields = error.status === 401 || error.status === 422 ? [email, password] : [];
    showError(error.message || "Не удалось войти. Попробуйте ещё раз.", fields);
  }
});

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const field = document.getElementById(button.dataset.passwordToggle);
    const showing = field.type === "text";
    field.type = showing ? "password" : "text";
    button.setAttribute("aria-pressed", String(!showing));
    button.setAttribute("aria-label", showing ? "Показать пароль" : "Скрыть пароль");
  });
});
