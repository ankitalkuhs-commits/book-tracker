// src/components/Feed.jsx
import React from "react";
import { styles } from "../styles";

/*
  Feed display: shows public notes / short posts.
  Props:
    - items: array of notes (each note may contain: id, text, emotion, user_name or user.name)
*/
export default function Feed({ items = [] }) {
  if (!items || items.length === 0) {
    return <div style={{ padding: 12 }}>No public notes yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((n) => (
        <div key={n.id ?? Math.random()} style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>{n.user_name || n.user?.name || "Someone"}</div>
            <div style={{ color: "#94a3b8", fontSize: "0.85em" }}>
              {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
            </div>
          </div>

          <div style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
            {n.text}
          </div>

          {n.emotion && (
            <div style={{ marginTop: 10, fontWeight: 600, color: "#1e3a8a" }}>
              Feeling: {n.emotion}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
