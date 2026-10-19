/** Same-origin path only, so ?redirect= can't send people off-site. */
export function isSafeRedirect(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

/** `path` with ?upgrade=<interval> set, the marker that resumes checkout after signing up. */
export function withUpgrade(path: string, interval: "month" | "year"): string {
  const url = new URL(path, "http://x");
  url.searchParams.set("upgrade", interval);
  return url.pathname + url.search + url.hash;
}
