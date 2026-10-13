import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Layout } from "./components/Layout";
import { CatalogPage } from "./pages/CatalogPage";
import { LessonPage } from "./pages/LessonPage";
import { LoginPage } from "./pages/LoginPage";

const rootRoute = createRootRoute({ component: Layout });

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: CatalogPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/lessons/$lessonId",
    component: LessonPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginPage }),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
