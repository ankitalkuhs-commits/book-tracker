// src/components/bookpulse/BookJournalModal.jsx
import React, { useState } from "react";
import { apiFetch, authHeaders } from "../../services/api";

export default function BookJournalModal({ entry, onClose, onSave }) {
  const [feeling, setFeeling] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (!text.trim()) {
      alert("Please add a note or journal entry before saving.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        entry_id: entry.id,
        feeling,
        text,
      };

      const data = await apiFetch("/journals/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Notify parent to update UI with the new journal
      onSave(entry.id, data);
    } catch (error) {
      console.error("Error saving journal:", error);
      setError(error.message || "Something went wrong while saving your note.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 560,
          background: "white",
          borderRadius: 8,
          padding: 20,
          boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>
          Add note for — <span style={{ fontWeight: 600 }}>{entry.title}</span>
        </h3>

        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#b91c1c",
              padding: "6px 10px",
              borderRadius: 6,
              marginBottom: 10,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <input
          type="text"
          placeholder="Feeling (optional)"
          value={feeling}
          onChange={(e) => setFeeling(e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ddd",
            marginBottom: 10,
            fontSize: 14,
          }}
        />

        <textarea
          rows="6"
          placeholder="Add a timestamped note or journal..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 14,
          }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "8px 12px",
              background: "#f3f4f6",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: "8px 12px",
              background: "#2563eb",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Saving..." : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
