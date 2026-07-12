import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// In Tauri desktop mode, the bundled API server runs on port 38080.
// Detect via window.__TAURI_INTERNALS__ (Tauri v2) or window.__TAURI__ (v1 compat).
const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

if (isTauri) {
  setBaseUrl("http://localhost:38080");
}

createRoot(document.getElementById("root")!).render(<App />);
