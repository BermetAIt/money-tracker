let accessToken = null;

export function setToken(token) {
  accessToken = token;
}

async function refresh() {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    accessToken = null;
    return false;
  }
  const data = await response.json();
  accessToken = data.access_token;
  return true;
}

export async function ensureSession() {
  if (accessToken) return true;
  return refresh();
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  let response = await fetch(path, { ...options, headers, credentials: "include" });
  if (response.status === 401 && (await refresh())) {
    headers.Authorization = `Bearer ${accessToken}`;
    response = await fetch(path, { ...options, headers, credentials: "include" });
  }
  return response;
}

export async function apiJson(path, options = {}) {
  const response = await api(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || "Не удалось выполнить запрос";
    const error = new Error(message);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}
