// src/components/AuthForm.jsx
import React, { useState } from "react";
import { apiFetch } from "../services/api";
import { styles } from "../styles";

/*
  AuthForm
  Props:
    - type: "login" or "signup"
    - onSuccess(token, user) -> callback when login/signup success
*/
export default function AuthForm({ type = "login", onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const path = type === "signup" ? "/auth/signup" : "/auth/login";
    // For signup we send a name as well (simple default)
    const body = type === "signup" ? { email, password, name: email.split("@")[0] } : { email, password };

    const r = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);

    if (r.ok) {
      // common token shapes: { access_token: "...", token: "...", ...}
      const token = r.data?.access_token || r.data?.token || r.data;
      const user = r.data?.user || null;
      onSuccess && onSuccess(token, user);
    } else {
      const msg = r.data?.detail || r.data || `Auth failed (${r.status})`;
      alert(msg);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 520 }}>
      <h3 style={{ marginTop: 0 }}>{type === "signup" ? "Sign up" : "Login"}</h3>
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={styles.input}
      />
      <input
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        type="password"
        style={styles.input}
      />
      <button style={styles.btn} disabled={busy}>
        {busy ? (type === "signup" ? "Signing up..." : "Logging in...") : (type === "signup" ? "Sign up" : "Login")}
      </button>
    </form>
  );
}
