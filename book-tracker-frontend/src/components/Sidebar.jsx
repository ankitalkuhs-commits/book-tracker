// src/components/Sidebar.jsx
import React from "react";
import { styles } from "../styles";
export default function Sidebar({ route }) {
  return (
    <aside style={styles.sidebar}>
      <h3 style={{ margin: "0 0 12px 0" }}>Quick Filters</h3>
      <div style={{ borderBottom: "1px solid #eee", marginBottom: 12 }} />
      {route === "books" && <ul style={{listStyle:'none', padding:0}}><li><button style={styles.filterBtn}>All</button></li></ul>}
      {route === "library" && <ul style={{listStyle:'none', padding:0}}><li><button style={styles.filterBtn}>All Books</button></li></ul>}
      {route === "feed" && <ul style={{listStyle:'none', padding:0}}><li><button style={styles.filterBtn}>All Updates</button></li></ul>}
    </aside>
  );
}
