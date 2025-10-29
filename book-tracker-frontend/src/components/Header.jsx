// src/components/Header.jsx
import React from "react";
import { styles } from "../styles";

export default function Header({ user, onRoute, onLogout, route }) {
  const getLinkStyle = (rt) => ({ ...styles.link, ...(route === rt ? styles.activeLink : {}) });
  return (
    <header style={styles.header}>
      <h1 style={{ cursor: "pointer", margin: 0 }} onClick={() => onRoute("books")}>BookPulse</h1>
      <nav>
        <button style={getLinkStyle("books")} onClick={() => onRoute("books")}>Books</button>
        <button style={getLinkStyle("library")} onClick={() => onRoute("library")}>My Library</button>
        <button style={getLinkStyle("feed")} onClick={() => onRoute("feed")}>Feed</button>
        <button style={getLinkStyle("follow")} onClick={() => onRoute("follow")}>Follow</button>
        {!localStorage.getItem("bt_token") ? (
          <>
            <button style={getLinkStyle("login")} onClick={() => onRoute("login")}>Login</button>
            <button style={getLinkStyle("signup")} onClick={() => onRoute("signup")}>Signup</button>
          </>
        ) : (
          <>
            <button style={getLinkStyle("profile")} onClick={() => onRoute("profile")}>Profile</button>
            <button style={styles.link} onClick={onLogout}>Logout</button>
          </>
        )}
      </nav>
    </header>
  );
}
