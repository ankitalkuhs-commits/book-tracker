// src/services/api.js
export const BACKEND = "http://127.0.0.1:8000";

export function authHeaders() {
  const token = localStorage.getItem("bt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path, opts = {}) {
  const url = BACKEND + path;
  const merged = {
    credentials: "same-origin",
    headers: { ...opts.headers },
    ...opts,
  };
  try {
    const res = await fetch(url, merged);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, err };
  }
}
