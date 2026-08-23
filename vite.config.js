import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "frontend",
  base: "/static/dist/",
  build: {
    outDir: "../static/dist",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: "frontend/src/main.jsx",
      output: { entryFileNames: "map-app.js", assetFileNames: "map-app.[ext]" },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
  },
});
