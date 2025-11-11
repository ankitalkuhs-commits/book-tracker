// src/components/bookpulse/BookJournalModal.jsx
import React, { useState } from "react";
import { apiFetch } from "../../services/api";

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
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '560px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            Add note for — <span style={{ fontWeight: 600 }}>{entry.title}</span>
          </h3>
        </div>

        <div className="modal-body">
          {error && (
            <div className="form-error">{error}</div>
          )}

          <div className="form-group">
            <input
              type="text"
              placeholder="Feeling (optional)"
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <textarea
              rows="6"
              placeholder="Add a timestamped note or journal..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="form-textarea"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} disabled={loading} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn btn-primary"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Saving..." : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
