import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { analytics } from "./lib/analytics";
import { api } from "./lib/api";
import { router } from "./router";
import "./styles.css";

const queryClient = new QueryClient({
  // In dev, refetch on window focus so content re-synced by `content:dev` shows up right away.
  defaultOptions: { queries: { staleTime: import.meta.env.DEV ? 0 : 30_000, retry: false } },
});

// Analytics config is fetched at runtime (one image serves every stage); a failure means off.
void api.config().then(
  (c) => analytics.init(c.analytics),
  () => analytics.init(null),
);
router.subscribe("onResolved", () => analytics.pageview());

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
