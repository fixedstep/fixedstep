/** Up to two uppercase letters for an avatar fallback: first and last word, or one word's first. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last = Array.from(words.at(-1) ?? "")[0] ?? "";
  return (words.length === 1 ? first : first + last).toUpperCase();
}

/**
 * Where a key moves focus in a menu of `count` items, currently at `current` (-1 when none is
 * focused). `"close"` for Escape, `null` for keys the menu doesn't handle.
 */
export function menuKeyTarget(
  key: string,
  current: number,
  count: number,
): number | "close" | null {
  switch (key) {
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowUp":
      return ((current < 0 ? count : current) - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "Escape":
      return "close";
    default:
      return null;
  }
}
