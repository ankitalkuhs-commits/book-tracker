// src/pages/BPLibrary.jsx
// BookPulse - My Library preview page
// Loads user's library from backend, shows per-book cards, allows adding timestamped journals,
// and displays a weekly pulse chart in the right sidebar.
//
// Requirements: uses apiFetch and authHeaders from ../services/api
// and BookJournalModal + WeeklyPulse components from ../components/bookpulse/*

import React, { useEffect, useState } from "react";
import BookJournalModal from "../components/bookpulse/BookJournalModal";
import WeeklyPulse from "../components/bookpulse/WeeklyPulse";
import { apiFetch } from "../services/api";

export default function BPLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);
  const [journalsByEntry, setJournalsByEntry] = useState({}); // { entryId: [journals...] }
  const [error, setError] = useState(null);

  useEffect(() => {
    loadLibrary();
  }, []);

  async function loadLibrary() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/userbooks/");
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("loadLibrary error:", error);
      if (error.message.includes('401')) {
        setError("Please login to view your library.");
      } else {
        setError("Failed to load library.");
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function openJournal(entry) {
    setActiveEntry(entry);
    setModalOpen(true);

    // Lazy-load journals for this entry if not already loaded
    if (!journalsByEntry[entry.id]) {
      try {
        const data = await apiFetch(`/journals/entry/${entry.id}`);
        setJournalsByEntry(prev => ({ ...prev, [entry.id]: Array.isArray(data) ? data : [] }));
      } catch (error) {
        console.error("load journals error:", error);
        // initialize empty if 404/no access
        setJournalsByEntry(prev => ({ ...prev, [entry.id]: [] }));
      }
    }
  }

  // Called by BookJournalModal after successful save (res.data returned)
  function handleSaveJournal(entryId, savedJournal) {
    // If API returned real object include it; otherwise savedJournal may be in-memory object
    setJournalsByEntry(prev => {
      const curr = prev[entryId] || [];
      return { ...prev, [entryId]: [savedJournal, ...curr] };
    });
    // Also consider annotating the corresponding item with a count
    setItems(prev => prev.map(i => (i.id === entryId ? { ...i, journals_count: (i.journals_count || 0) + 1 } : i)));
  }

  // Mark a book finished via PATCH to userbooks endpoint
  async function markFinished(entry) {
    try {
      const payload = { status: "finished", current_page: entry.total_pages || entry.current_page };
      await apiFetch(`/userbooks/${entry.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      
      // update local state
      setItems(prev => prev.map(i => (i.id === entry.id ? { ...i, status: "finished", current_page: payload.current_page } : i)));
    } catch (error) {
      console.error("markFinished error:", error);
      alert("Failed to mark as finished.");
    }
  }

  // Update current page (basic inline prompt; replace with nicer modal if desired)
  async function updatePages(entry) {
    const val = prompt("Enter current page number:", entry.current_page || 0);
    if (val === null) return;
    const newPage = parseInt(val, 10);
    if (isNaN(newPage) || newPage < 0) return alert("Invalid page number.");
    
    try {
      const payload = { current_page: newPage, status: newPage > 0 ? "reading" : entry.status };
      await apiFetch(`/userbooks/${entry.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      
      setItems(prev => prev.map(i => (i.id === entry.id ? { ...i, ...payload } : i)));
    } catch (error) {
      console.error("updatePages error:", error);
      alert("Failed to update pages.");
    }
  }

  // Helper to format progress percent
  function progressPercent(item) {
    const total = item.total_pages || 1;
    const cur = item.current_page || 0;
    return Math.round((cur / total) * 100);
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h2 style={{ marginBottom: 6 }}>My Library (Preview)</h2>

      {loading && <div>Loading your library…</div>}
      {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}

      {!loading && items.length === 0 && <div>No books in your library yet.</div>}

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>My Library</h3>

          {items.map(item => (
            <div
              key={item.id}
              style={{
                background: "white",
                borderRadius: 8,
                padding: 16,
                marginBottom: 14,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <img
                src={item.cover || `https://picsum.photos/seed/${item.id}/80/120`}
                alt=""
                style={{ width: 80, height: 120, objectFit: "cover", borderRadius: 6 }}
              />

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div style={{ color: "#666", marginBottom: 8 }}>{item.author}</div>

                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Status: <strong>{item.status}</strong> &nbsp; Total Pages: {item.total_pages || "—"} &nbsp; Current Page: {item.current_page || 0}
                </div>

                <div style={{ height: 10, background: "#eee", borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ width: `${progressPercent(item)}%`, height: "100%", background: "#22c55e" }} />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openJournal(item)}
                    style={{ padding: "8px 12px", background: "#f3f4f6", borderRadius: 6, border: "none", cursor: "pointer" }}
                  >
                    Add Note
                  </button>

                  <button
                    onClick={() => updatePages(item)}
                    style={{ padding: "8px 12px", background: "#e6eef9", borderRadius: 6, border: "none", cursor: "pointer" }}
                  >
                    Update Pages
                  </button>

                  <button
                    onClick={() => markFinished(item)}
                    style={{ padding: "8px 12px", background: "#2563eb", color: "white", borderRadius: 6, border: "none", cursor: "pointer" }}
                  >
                    Mark as Finished
                  </button>
                </div>

                {/* Show journals count + preview */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, color: "#444", marginBottom: 6 }}>
                    Notes: {journalsByEntry[item.id] ? journalsByEntry[item.id].length : (item.journals_count || 0)}
                  </div>

                  {(journalsByEntry[item.id] || []).slice(0, 3).map(j => (
                    <div key={j.id} style={{ background: "#fafafa", padding: 8, borderRadius: 6, marginBottom: 6 }}>
                      <div style={{ fontSize: 12, color: "#666" }}>{new Date(j.timestamp).toLocaleString()} {j.feeling ? `• ${j.feeling}` : ""}</div>
                      <div style={{ marginTop: 6 }}>{j.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside style={{ width: 300 }}>
          <div style={{ background: "white", padding: 12, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 12 }}>
            <h4 style={{ marginTop: 0 }}>Your Weekly Pulse</h4>
            <WeeklyPulse />
          </div>

          <div style={{ background: "white", padding: 12, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h4 style={{ marginTop: 0 }}>Quick Actions</h4>
            <div style={{ fontSize: 13, color: "#666" }}>Export, import, filters — coming soon</div>
          </div>
        </aside>
      </div>

      {modalOpen && activeEntry && (
        <BookJournalModal
          entry={activeEntry}
          onClose={() => {
            setModalOpen(false);
            setActiveEntry(null);
          }}
          onSave={async (entryId, returnedJournal) => {
            // If returnedJournal is from API, use it; otherwise attempt to save via API:
            if (returnedJournal && returnedJournal.id) {
              handleSaveJournal(entryId, returnedJournal);
            } else {
              // No server-backed journal returned: attempt to POST
              try {
                const payload = { entry_id: entryId, feeling: returnedJournal?.feeling || "", text: returnedJournal?.text || "" };
                const data = await apiFetch("/journals/", {
                  method: "POST",
                  body: JSON.stringify(payload),
                });
                
                handleSaveJournal(entryId, data);
              } catch (error) {
                console.error("save journal fallback error:", error);
                alert("Failed to save note.");
              }
            }
            // close modal
            setModalOpen(false);
            setActiveEntry(null);
          }}
        />
      )}
    </div>
  );
}
