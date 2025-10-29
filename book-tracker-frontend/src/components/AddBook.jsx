// src/components/AddBook.jsx
import React, { useState } from "react";
import { apiFetch, authHeaders } from "../services/api"; // we export apiFetch earlier
import { styles } from "../styles";

// if your api file exports apiFetch, import accordingly
import { apiFetch as fetcher, authHeaders as getAuthHeaders } from "../services/api";

export default function AddBook({ onAdded }) {
  const [title,setTitle] = useState("");
  const [author,setAuthor] = useState("");
  const [pages,setPages] = useState("");

  async function submit(e){
    e.preventDefault();
    const r = await fetcher("/books/", { method: "POST", headers: { "Content-Type":"application/json", ...getAuthHeaders() }, body: JSON.stringify({ title, author, total_pages: pages?Number(pages):undefined })});
    if(r.ok){ setTitle(""); setAuthor(""); setPages(""); onAdded && onAdded(); }
    else alert("Failed: " + (r.data?.detail || r.status));
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 20, maxWidth: 700 }}>
      <h3>Add a Book</h3>
      <div style={{display:"grid", gap:8}}>
        <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} required style={styles.input} />
        <input placeholder="Author" value={author} onChange={e=>setAuthor(e.target.value)} style={styles.input} />
        <input placeholder="Total pages" value={pages} onChange={e=>setPages(e.target.value)} style={styles.input} />
        <button style={styles.btn}>Add Book</button>
      </div>
    </form>
  );
}
