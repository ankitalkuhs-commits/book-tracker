// src/components/AddBook.jsx
import React, { useState } from "react";
import { apiFetch, authHeaders } from "../services/api";
import { styles } from "../styles";

const GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes?q=";

export default function AddBook({ onAdded }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [manual, setManual] = useState({
    title: "",
    author: "",
    total_pages: "",
    cover_url: "",
    isbn: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function searchBooks(e) {
    if (e.key !== "Enter" || !query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(GOOGLE_BOOKS_URL + encodeURIComponent(query));
      const data = await r.json();
      if (data.items) {
        setResults(
          data.items.map((b) => ({
            title: b.volumeInfo.title || "",
            author: b.volumeInfo.authors?.join(", ") || "Unknown",
            total_pages: b.volumeInfo.pageCount || "",
            cover_url: b.volumeInfo.imageLinks?.thumbnail || "",
            isbn:
              b.volumeInfo.industryIdentifiers?.[0]?.identifier || "N/A",
            description: b.volumeInfo.description || "",
          }))
        );
      } else {
        setResults([]);
        setError("No books found. You can add manually below.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch from Google Books API.");
    } finally {
      setLoading(false);
    }
  }

  async function addBook(b) {
    try {
      await apiFetch("/books/", {
        method: "POST",
        body: JSON.stringify(b),
      });
      
      onAdded && onAdded();
      setQuery("");
      setResults([]);
      setManual({
        title: "",
        author: "",
        total_pages: "",
        cover_url: "",
        isbn: "",
        description: "",
      });
    } catch (error) {
      console.error('Error adding book:', error);
      alert("Failed to add book");
    }
  }

  async function addManualBook() {
    if (!manual.title.trim()) {
      alert("Please enter a title");
      return;
    }
    addBook(manual);
  }

  return (
    <div style={styles.card}>
      <h3>Add a new book to your interest list</h3>
      <input
        placeholder="Search by title or author (press Enter)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={searchBooks}
        style={styles.input}
      />
      {loading && <div>Searching...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {results.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4>Search Results</h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
              gap: 12,
            }}
          >
            {results.map((b, i) => (
              <div key={i} style={styles.card}>
                <div style={{ display: "flex", gap: 8 }}>
                  {b.cover_url && (
                    <img
                      src={b.cover_url}
                      alt={b.title}
                      style={{ width: 60, height: 90, objectFit: "cover" }}
                    />
                  )}
                  <div>
                    <strong>{b.title}</strong>
                    <div style={{ fontSize: "0.9em", color: "#555" }}>
                      {b.author}
                    </div>
                    {b.total_pages && (
                      <div style={{ fontSize: "0.8em", color: "#777" }}>
                        {b.total_pages} pages
                      </div>
                    )}
                  </div>
                </div>
                <button
                  style={{ ...styles.smallBtn, marginTop: 8 }}
                  onClick={() => addBook(b)}
                >
                  Add Book
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Add Section */}
      <div style={{ marginTop: 20 }}>
        <h4>Or add manually</h4>
        {["title", "author", "total_pages", "cover_url", "isbn"].map((f) => (
          <input
            key={f}
            placeholder={f.replace("_", " ").toUpperCase()}
            value={manual[f]}
            onChange={(e) =>
              setManual((m) => ({ ...m, [f]: e.target.value }))
            }
            style={styles.input}
          />
        ))}
        <textarea
          placeholder="Description"
          value={manual.description}
          onChange={(e) =>
            setManual((m) => ({ ...m, description: e.target.value }))
          }
          style={styles.textarea}
        />
        <button style={styles.btn} onClick={addManualBook}>
          Add Book
        </button>
      </div>
    </div>
  );
}
