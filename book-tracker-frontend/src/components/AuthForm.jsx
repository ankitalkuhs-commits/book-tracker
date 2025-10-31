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
    
    // Validation for signup
    if (type === "signup") {
      if (password.length < 8) {
        alert("Password must be at least 8 characters long");
        return;
      }
      if (password.length > 128) {
        alert("Password must be less than 128 characters");
        return;
      }
    }
    
    setBusy(true);
    const path = type === "signup" ? "/auth/signup" : "/auth/login";
    // For signup we send a name as well (simple default)
    const body = type === "signup" ? { email, password, name: email.split("@")[0] } : { email, password };

    try {
      const data = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(body),
      });

      // common token shapes: { access_token: "...", token: "...", ...}
      const token = data?.access_token || data?.token || data;
      const user = data?.user || null;
      onSuccess && onSuccess(token, user);
    } catch (error) {
      alert(error.message || `Auth failed`);
    } finally {
      setBusy(false);
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
        minLength={type === "signup" ? 8 : undefined}
        maxLength={type === "signup" ? 128 : undefined}
        style={styles.input}
      />
      {type === "signup" && password.length > 0 && password.length < 8 && (
        <div style={{ color: "red", fontSize: "0.875rem", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
          Password must be at least 8 characters
        </div>
      )}
      <button style={styles.btn} disabled={busy}>
        {busy ? (type === "signup" ? "Signing up..." : "Logging in...") : (type === "signup" ? "Sign up" : "Login")}
      </button>
    </form>
  );
}
