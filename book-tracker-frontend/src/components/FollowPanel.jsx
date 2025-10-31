// src/components/FollowPanel.jsx
import React, { useState } from "react";
import { apiFetch, authHeaders } from "../services/api";
import { styles } from "../styles";

/*
  FollowPanel
  Props:
    - onMessage(msg) optional: used to show transient messages in App
*/
export default function FollowPanel({ onMessage }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function follow() {
    if (!email) {
      onMessage?.("Enter an email to follow");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/follow/", {
        method: "POST",
        body: JSON.stringify({ followed_email: email }),
      });
      
      onMessage?.("Followed!");
      setEmail("");
    } catch (error) {
      console.error('Error following:', error);
      onMessage?.(error.message || "Follow failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Follow someone</h3>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            placeholder="Enter their email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <button style={styles.btn} onClick={follow} disabled={busy}>
            {busy ? "Following..." : "Follow"}
          </button>
        </div>
        <div style={{ marginTop: 8, color: "#6b7280", fontSize: "0.9em" }}>
          Follow users to see their public updates in your feed.
        </div>
      </div>
    </div>
  );
}
