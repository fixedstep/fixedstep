import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API in dev, mirroring production (where the API process serves the SPA).
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:3000" },
  },
  worker: { format: "es" },
});
