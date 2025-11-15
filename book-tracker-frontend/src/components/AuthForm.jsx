// src/components/AuthForm.jsx
import React, { useState } from "react";
import { GoogleLogin } from '@react-oauth/google';
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

  async function handleGoogleSuccess(credentialResponse) {
    setBusy(true);
    try {
      const data = await apiFetch("/auth/google", {
        method: "POST",
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const token = data?.access_token || data?.token || data;
      const user = data?.user || null;
      onSuccess && onSuccess(token, user);
    } catch (error) {
      alert(error.message || "Google sign in failed");
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleError() {
    alert("Google sign in failed. Please try again.");
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h3 style={{ marginTop: 0 }}>{type === "signup" ? "Sign up" : "Login"}</h3>
      
      {/* Google Sign In Button */}
      <div style={{ marginBottom: '1.5rem' }}>
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          useOneTap
          text={type === "signup" ? "signup_with" : "signin_with"}
        />
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', color: '#9CA3AF' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }}></div>
        <span style={{ padding: '0 1rem', fontSize: '0.875rem' }}>OR</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }}></div>
      </div>

      {/* Traditional Email/Password Form */}
      <form onSubmit={submit}>
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
    </div>
  );
}
