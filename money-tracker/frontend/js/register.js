import { apiJson, setToken } from "./api.js";

const form = document.getElementById("register-form");
const card = document.querySelector(".auth-card");
const name = document.getElementById("name");
const email = document.getElementById("email");
const password = document.getElementById("password");
const err = document.getElementById("err");
const submit = document.getElementById("register-submit");
const meterLabel = document.getElementById("meter-label");
const meterSegments = [...document.querySelectorAll("#password-strength span")];
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

function scorePassword(value) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[a-zа-я]/.test(value) && /[A-ZА-Я]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-zА-Яа-я0-9]/.test(value)) score += 1;
  const labels = ["Введите пароль", "Слабый пароль", "Средний пароль", "Хороший пароль", "Надёжный пароль"];
  const colors = ["#e9e7f3", "#e54868", "#e9a23b", "#6d5dfb", "#087a5b"];
  return { score, label: labels[score], color: colors[score] };
}

password.addEventListener("input", () => {
  const result = scorePassword(password.value);
  meterSegments.forEach((segment, index) => {
    segment.classList.toggle("active", index < result.score);
  });
  document.getElementById("password-strength").style.setProperty("--strength-color", result.color);
  meterLabel.textContent = result.label;
});

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
  if (name.value.trim().length < 2) invalid.push(name);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) invalid.push(email);
  if (password.value.length < 8) invalid.push(password);
  if (invalid.length) {
    showError("Заполните имя, укажите корректную почту и пароль не короче 8 символов.", invalid);
    return;
  }

  submit.disabled = true;
  submit.innerHTML =
    '<span class="auth-spinner" aria-hidden="true"></span><span class="auth-submit-label">Создаём аккаунт…</span>';
  try {
    const data = await apiJson("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
        remember_me: document.getElementById("remember").checked,
      }),
    });
    setToken(data.access_token);
    authenticated = true;
    submit.disabled = false;
    submit.classList.add("is-success");
    submit.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="auth-check" d="m5 12 4 4L19 6"></path></svg><span class="auth-submit-label">Открыть приложение</span>';
  } catch (error) {
    submit.disabled = false;
    submit.innerHTML = '<span class="auth-submit-label">Создать аккаунт</span>';
    const fields =
      error.status === 409 ? [email] : error.status === 422 ? [name, email, password] : [];
    showError(error.message || "Не удалось создать аккаунт. Попробуйте ещё раз.", fields);
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
