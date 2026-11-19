import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Me } from "../lib/api";
import { UserMenu } from "./UserMenu";

vi.mock("../lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

type User = NonNullable<Me["user"]>;

function render(user: Partial<User>, pro: boolean): string {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const u = { name: "Ada Lovelace", email: "ada@example.com", image: null, ...user } as User;
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(
        RouterContextProvider,
        { router } as never,
        createElement(UserMenu, { user: u, pro }),
      ),
    ),
  );
}

const itemLabels = (html: string) =>
  [...html.matchAll(/role="menuitem"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe("UserMenu markup", () => {
  it("trigger has menu ARIA and aria-controls points at the menu element", () => {
    const html = render({}, false);
    const trigger = html.match(/<button[^>]*class="user-menu-trigger"[^>]*>/)?.[0] ?? "";
    expect(trigger).toContain('aria-haspopup="menu"');
    expect(trigger).toContain('aria-expanded="false"');
    const controls = trigger.match(/aria-controls="([^"]+)"/)?.[1];
    const triggerId = trigger.match(/ id="([^"]+)"/)?.[1];
    expect(controls).toBeTruthy();
    expect(triggerId).toBeTruthy();
    const menu = html.match(/<div[^>]*role="menu"[^>]*>/)?.[0] ?? "";
    expect(menu).toContain(`id="${controls}"`);
    expect(menu).toContain(`aria-labelledby="${triggerId}"`);
  });

  it("panel is hidden when closed", () => {
    expect(render({}, false)).toMatch(/class="user-menu-panel" hidden/);
  });

  it("shows name and email in the header", () => {
    const html = render({}, false);
    expect(html).toContain("ada@example.com");
    expect(html).toContain("Ada Lovelace");
  });

  it("free user: Settings then Sign out, no billing, no PRO badge", () => {
    const html = render({}, false);
    expect(itemLabels(html)).toEqual(["Settings", "Sign out"]);
    expect(html).not.toContain("Manage billing");
    expect(html).not.toContain("PRO");
  });

  it("pro user: Settings, Manage billing, Sign out, and PRO badge", () => {
    const html = render({}, true);
    expect(itemLabels(html)).toEqual(["Settings", "Manage billing", "Sign out"]);
    expect(html).toContain('<span class="badge">PRO</span>');
  });

  it("menu items are direct children of the menu with tabindex -1", () => {
    const html = render({}, true);
    const inner = html.match(/role="menu"[^>]*>(.*)$/s)?.[1] ?? "";
    expect(inner.match(/role="menuitem"/g)).toHaveLength(3);
    expect(inner.match(/tabindex="-1"/g)?.length).toBe(3);
    expect(html).toContain('href="/settings"');
  });

  it("falls back to initials when there is no image", () => {
    const html = render({ image: null }, false);
    expect(html).toContain('<span class="avatar" aria-hidden="true">AL</span>');
    expect(html).not.toContain("<img");
  });

  it("renders an aria-hidden img when an image is set", () => {
    const html = render({ image: "https://img.example/a.png" }, false);
    const img = html.match(/<img[^>]*>/)?.[0] ?? "";
    expect(img).toContain('src="https://img.example/a.png"');
    expect(img).toContain('alt=""');
    expect(img).toContain('aria-hidden="true"');
    expect(img).toContain('referrerPolicy="no-referrer"');
    expect(html).not.toContain(">AL<");
  });

  it("blank name falls back to ?", () => {
    expect(render({ name: "  " }, false)).toContain(">?</span>");
  });

  it("escapes HTML in the name", () => {
    const html = render({ name: "<b>x</b>" }, false);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
