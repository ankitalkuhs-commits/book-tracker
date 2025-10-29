// src/styles.js
export const styles = {
  app: { fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", background: "#f7fafc" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #edf2f7" },
  container: { display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, padding: 24 },
  main: { background: "transparent", padding: "0 8px" },
  sidebar: { background: "#fff", border: "1px solid #edf2f7", padding: 16, borderRadius: 8, height: "fit-content" },
  card: { background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.03)", border: "1px solid #edf2f7" },
  link: { marginLeft: 8, padding: "8px 10px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer" },
  activeLink: { background: "#e6f2ff", color: "#1e3a8a" },
  btn: { background: "#2b6cb0", color: "#fff", padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer" },
  smallBtn: { background: "#edf2f7", color: "#2b6cb0", padding: "6px 8px", borderRadius: 6, border: "none", cursor: "pointer" },
  input: { padding: 8, borderRadius: 6, border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" },
  textarea: { padding: 8, borderRadius: 6, border: "1px solid #e2e8f0", width: "100%", minHeight: 100, boxSizing: "border-box" },
  filterBtn: { padding: "6px 8px", border: "none", background: "#f1f5f9", borderRadius: 6, width: "100%", textAlign: "left", marginBottom: 6 },
  alert: { background: "#e6fffa", color: "#065f46", padding: 10, borderRadius: 6, marginBottom: 12 }
};
