// src/components/BookList.jsx
import React, { useState } from "react";
import { styles } from "../styles";

export default function BookList({ books = [], onAddToLibrary }) {
  const ITEMS_PER_PAGE = 6;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(books.length / ITEMS_PER_PAGE));
  const start = (page - 1) * ITEMS_PER_PAGE;
  const shown = books.slice(start, start + ITEMS_PER_PAGE);

  return (
    <div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16}}>
        {shown.map(b=>(
          <div key={b.id} style={styles.card}>
            <div style={{display:'flex', gap:12}}>
              {b.cover_url ? <img src={b.cover_url} alt={b.title} style={{width:80,height:120,objectFit:'cover'}} /> : <div style={{width:80,height:120,background:'#eee'}}/>}
              <div style={{flex:1}}>
                <h3 style={{margin:'0 0 8px 0'}}>{b.title}</h3>
                <div style={{color:'#555'}}>{b.author||'Unknown'}</div>
                {b.description && <div style={{color:'#666'}}>{b.description.slice(0,140)}{b.description.length>140?'…':''}</div>}
                {b.total_pages && <div style={{color:'#666', marginTop:8}}>Pages: {b.total_pages}</div>}
              </div>
            </div>
            <div style={{marginTop:12}}>
              <button style={styles.btn} onClick={()=>onAddToLibrary && onAddToLibrary(b.id)}>Add to Library</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{marginTop:16, display:'flex', gap:8, justifyContent:'center'}}>
        {Array.from({length: totalPages}).map((_,i)=>(
          <button key={i} onClick={()=>setPage(i+1)} style={{padding:'6px 10px', background: page===i+1 ? '#2b6cb0':'#fff', color: page===i+1 ? '#fff':'#333', border:'1px solid #ddd', borderRadius:6}}>{i+1}</button>
        ))}
      </div>
    </div>
  );
}
