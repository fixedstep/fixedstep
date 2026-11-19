import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Layout } from "./components/Layout";
import { NotFound } from "./components/NotFound";
import { PRIVACY, TERMS } from "./legal/legal";
import { isSafeRedirect } from "./lib/redirect";
import { HomePage } from "./pages/home/HomePage";
import { LegalPage } from "./pages/LegalPage";
import { LessonPage } from "./pages/LessonPage";
import { LoginPage, type LoginSearch } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: () => <NotFound /> });

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/lessons/$lessonId",
    component: LessonPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginPage,
    validateSearch: (s: Record<string, unknown>): LoginSearch => ({
      ...(s.mode === "signUp" ? { mode: "signUp" as const } : {}),
      ...(typeof s.redirect === "string" && isSafeRedirect(s.redirect)
        ? { redirect: s.redirect }
        : {}),
    }),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/reset-password",
    component: ResetPasswordPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/privacy",
    component: () => <LegalPage source={PRIVACY} />,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/terms",
    component: () => <LegalPage source={TERMS} />,
  }),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
