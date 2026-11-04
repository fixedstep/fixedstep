import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgreeNotice } from "./LegalNotice";

function Wrapper({ router }: { router: AnyRouter }) {
  return createElement(
    RouterContextProvider,
    { router } as never,
    createElement(AgreeNotice, { lead: "By signing up" }),
  );
}

describe("AgreeNotice", () => {
  it("renders the lead and links to terms and privacy in new tabs", () => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    const html = renderToStaticMarkup(createElement(Wrapper, { router }));
    expect(html).toContain("By signing up, you agree to the");
    for (const [href, text] of [
      ["/terms", "Terms of Service"],
      ["/privacy", "Privacy Policy"],
    ]) {
      const a = html.match(new RegExp(`<a ([^>]*)>${text}</a>`));
      expect(a?.[1]).toContain(`href="${href}"`);
      expect(a?.[1]).toContain('target="_blank"');
    }
  });
});
