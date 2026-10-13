import { createAuthClient } from "better-auth/react";

// Same origin as the API (CloudFront /api/* in AWS, Vite proxy locally).
export const authClient = createAuthClient({ baseURL: window.location.origin });
