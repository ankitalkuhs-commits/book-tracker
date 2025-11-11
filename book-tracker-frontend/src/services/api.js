// src/services/api.js
export const BACKEND = "http://127.0.0.1:8000";

export function authHeaders() {
  const token = localStorage.getItem("bt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path, opts = {}) {
  const url = BACKEND + path;
  
  // Check if body is FormData - if so, don't set Content-Type (browser will set it with boundary)
  const isFormData = opts.body instanceof FormData;
  
  const merged = {
    ...opts,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  };
  
  const res = await fetch(url, merged);
  const text = await res.text();
  let data;
  try { 
    data = text ? JSON.parse(text) : null; 
  } catch {
    data = text; 
  }
  
  if (!res.ok) {
    const errorMsg = (data && data.detail) || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(errorMsg);
  }
  
  return data;
}
