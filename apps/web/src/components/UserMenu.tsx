import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { analytics } from "../lib/analytics";
import type { Me } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { initials, menuKeyTarget } from "../lib/user-menu";
import { ManageBillingButton } from "./ManageBillingButton";

type Where = "first" | "last";

function menuItems(list: HTMLElement | null): HTMLElement[] {
  return Array.from(list?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
}

function focusMenuItem(list: HTMLElement | null, where: Where) {
  const items = menuItems(list);
  (where === "first" ? items[0] : items[items.length - 1])?.focus();
}

/** The signed-in account menu in the header. Guests don't get one. */
export function UserMenu({ user, pro }: { user: NonNullable<Me["user"]>; pro: boolean }) {
  const qc = useQueryClient();
  const href = useLocation({ select: (l) => l.href });
  const [open, setOpen] = useState(false);
  const focusOnOpen = useRef<Where>("first");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const menuId = useId();

  // Focus the first or last item when the menu opens.
  useEffect(() => {
    if (open) focusMenuItem(listRef.current, focusOnOpen.current);
  }, [open]);

  // Close on a pointer press outside the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the menu on navigation
  useEffect(() => setOpen(false), [href]);

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const where: Where = e.key === "ArrowDown" ? "first" : "last";
    if (open) {
      focusMenuItem(listRef.current, where);
    } else {
      focusOnOpen.current = where;
      setOpen(true);
    }
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = menuItems(listRef.current);
    const current = items.indexOf(document.activeElement as HTMLElement);
    const target = menuKeyTarget(e.key, current, items.length);
    if (target === null) {
      // Links don't activate on Space, so do it for them.
      if (e.key === " " && document.activeElement instanceof HTMLAnchorElement) {
        e.preventDefault();
        document.activeElement.click();
      }
      return;
    }
    e.preventDefault();
    if (target === "close") {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    items[target]?.focus();
  }

  async function signOut() {
    setOpen(false);
    await authClient.signOut();
    analytics.setUser(null);
    await qc.invalidateQueries();
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        id={triggerId}
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          focusOnOpen.current = "first";
          setOpen((o) => !o);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {user.image ? (
          <img
            className="avatar"
            src={user.image}
            alt=""
            aria-hidden="true"
            width={28}
            height={28}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
        )}
        <span className="user-menu-name">{user.name}</span>
      </button>
      <div className="user-menu-panel" hidden={!open}>
        <div className="user-menu-who">
          <strong>
            {user.name}
            {pro && <span className="badge">PRO</span>}
          </strong>
          <span className="muted">{user.email}</span>
        </div>
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={onListKeyDown}
        >
          {/* Profile goes first once profile-page lands. */}
          <Link to="/settings" role="menuitem" tabIndex={-1} className="user-menu-item">
            Settings
          </Link>
          {pro && <ManageBillingButton role="menuitem" tabIndex={-1} className="user-menu-item" />}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="user-menu-item"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
