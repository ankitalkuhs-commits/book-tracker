// src/components/UserLibrary.jsx
import React from "react";
import { styles } from "../styles";
import { apiFetch, authHeaders } from "../services/api";

export default function UserLibrary({ items = [], onRefresh, setMsg }) {
  if (!Array.isArray(items)) return <div>Loading...</div>;
  if (items.length === 0) return <div>No books in your library yet.</div>;

  return (
    <div style={{display:'grid', gap:12}}>
      {items.map(u => {
        const b = u.book || {};
        return (
          <div key={u.id} style={styles.card}>
            <div style={{display:'flex', gap:12}}>
              {b.cover_url ? <img src={b.cover_url} alt={b.title} style={{width:80,height:120,objectFit:'cover'}} /> : <div style={{width:80,height:120,background:'#eee'}}/>}
              <div style={{flex:1}}>
                <h3 style={{margin:0}}>{b.title || 'Unknown'}</h3>
                <div style={{color:'#666'}}>{b.author}</div>
                <div style={{marginTop:8}}>Status: {u.status}</div>
                <div>Page: {u.current_page ?? 0}</div>
              </div>
            </div>
            <div style={{marginTop:12}}>
              <button style={styles.smallBtn} onClick={async () => {
                const r = await apiFetch(`/userbooks/${u.id}`, { method: "PUT", headers: { "Content-Type":"application/json", ...authHeaders() }, body: JSON.stringify({ status: "finished", current_page: b.total_pages || u.current_page }) });
                if(r.ok){ setMsg("Updated"); onRefresh && onRefresh(); } else setMsg("Failed update");
              }}>Mark as finished</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
