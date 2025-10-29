// src/index.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Optional: import global CSS (Vite template usually has main.css)
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
