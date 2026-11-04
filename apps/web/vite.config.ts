import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The dev container sets 0.0.0.0 so its published port reaches Vite; unset = localhost only.
    host: process.env.VITE_HOST,
    // Same-origin API in dev, mirroring production (where the API process serves the SPA).
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:3000" },
  },
  worker: { format: "es" },
});
