// src/components/UserLibrary.jsx
import React, { useState } from "react";
import { styles } from "../styles";
import { apiFetch } from "../services/api";

/**
 * UserLibrary component
 * Props:
 *  - items: array of userbook objects returned by GET /userbooks
 *  - onRefresh: function to call after successful update
 *  - setMsg: function to display notifications
 */
export default function UserLibrary({ items = [], onRefresh, setMsg }) {
  const [editing, setEditing] = useState(null); // which book ID is being edited
  const [pageInput, setPageInput] = useState(""); // temporary page input
  const [loadingIds, setLoadingIds] = useState(new Set()); // which books are loading

  if (!Array.isArray(items)) return <div>Loading...</div>;
  if (items.length === 0) return <div>No books in your library yet.</div>;

  // helper: show spinner state
  const setLoading = (id, val) => {
    setLoadingIds(prev => {
      const s = new Set(prev);
      if (val) s.add(id);
      else s.delete(id);
      return s;
    });
  };

  // helper: compute progress
  function getProgress(u) {
    const cur = Number(u.current_page || 0);
    const total = Number(u.book?.total_pages || 0);
    if (total > 0) {
      const pct = Math.min(100, Math.round((cur / total) * 100));
      return { pct, label: `${cur}/${total}` };
    } else {
      return { pct: cur > 0 ? 20 : 0, label: `${cur}` };
    }
  }

  // save reading progress (PUT /userbooks/{id}/progress)
  async function saveProgress(u) {
    const id = u.id;
    const val = parseInt(pageInput, 10);
    if (Number.isNaN(val) || val < 0) {
      setMsg("Please enter a valid page number");
      return;
    }

    setLoading(id, true);
    try {
      await apiFetch(`/userbooks/${id}/progress`, {
        method: "PUT",
        body: JSON.stringify({ current_page: val }),
      });

      setMsg("Progress updated");
      setEditing(null);
      setPageInput("");
      onRefresh && onRefresh();
    } catch (error) {
      console.error('Error updating progress:', error);
      setMsg("Failed to update");
    } finally {
      setLoading(id, false);
    }
  }

  // mark as finished (POST /userbooks/{id}/finish)
  async function markFinished(u) {
    const id = u.id;
    setLoading(id, true);
    try {
      await apiFetch(`/userbooks/${id}/finish`, {
        method: "POST",
      });

      setMsg("Marked as finished");
      onRefresh && onRefresh();
    } catch (error) {
      console.error('Error marking as finished:', error);
      setMsg("Failed to mark finished");
    } finally {
      setLoading(id, false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((u) => {
        const b = u.book || {};
        const isLoading = loadingIds.has(u.id);
        const { pct, label } = getProgress(u);

        return (
          <div key={u.id} style={styles.card}>
            <div style={{ display: "flex", gap: 12 }}>
              {b.cover_url ? (
                <img
                  src={b.cover_url}
                  alt={b.title}
                  style={{ width: 80, height: 120, objectFit: "cover" }}
                />
              ) : (
                <div style={{ width: 80, height: 120, background: "#eee" }} />
              )}

              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }}>{b.title || "Unknown Title"}</h3>
                <div style={{ color: "#666" }}>{b.author || "Unknown Author"}</div>

                <div style={{ marginTop: 8, display: "flex", gap: 12 }}>
                  <div>Status: <strong>{u.status}</strong></div>
                  <div>Total Pages: {b.total_pages ?? "—"}</div>
                  <div>Current Page: {u.current_page ?? 0}</div>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: 10 }}>
                  <div style={{
                    height: 10,
                    background: "#eee",
                    borderRadius: 6,
                    overflow: "hidden",
                  }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "#48bb78",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: "0.8em", color: "#666", marginTop: 4 }}>
                    {label} ({pct}%)
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {editing === u.id ? (
                <>
                  <input
                    type="number"
                    placeholder="Enter current page"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    style={{
                      width: 100,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #ccc",
                    }}
                  />
                  <button
                    style={styles.smallBtn}
                    onClick={() => saveProgress(u)}
                    disabled={isLoading}
                  >
                    {isLoading ? "Saving..." : "Save"}
                  </button>
                  <button
                    style={{ ...styles.smallBtn, background: "#eee", color: "#333" }}
                    onClick={() => { setEditing(null); setPageInput(""); }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    style={styles.smallBtn}
                    onClick={() => {
                      setEditing(u.id);
                      setPageInput(String(u.current_page ?? ""));
                    }}
                  >
                    Update Pages
                  </button>

                  <button
                    style={{
                      ...styles.smallBtn,
                      background: "#2b6cb0",
                      color: "white",
                    }}
                    onClick={() => markFinished(u)}
                    disabled={isLoading}
                  >
                    {isLoading ? "..." : "Mark as Finished"}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
