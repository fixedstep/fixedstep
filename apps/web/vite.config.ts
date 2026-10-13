import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API in dev, mirroring CloudFront's /api/* behavior in AWS.
    proxy: { "/api": "http://localhost:3000" },
  },
  worker: { format: "es" },
});
