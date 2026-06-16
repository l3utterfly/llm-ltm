import React from "react";
import { createRoot } from "react-dom/client";
import { installDemoHost } from "./demo/data";
import App from "./App";
import "./styles.css";

if (import.meta.env.DEV) {
  installDemoHost();
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
