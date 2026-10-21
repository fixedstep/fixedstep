import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Same origin as the API (the API serves the SPA in production, Vite proxies locally).
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [anonymousClient()],
});
