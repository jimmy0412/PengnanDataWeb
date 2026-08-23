import React from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./map.css";
import App from "./App";

const mount = document.getElementById("map-react-root");
if (mount) {
  let config = {};
  try { config = JSON.parse(mount.dataset.config || "{}"); } catch { /* defaults are safe */ }
  createRoot(mount).render(<React.StrictMode><App config={config}/></React.StrictMode>);
}
