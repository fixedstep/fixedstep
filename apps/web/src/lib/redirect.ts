/** Same-origin path only, so ?redirect= can't send people off-site. */
export function isSafeRedirect(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

/** `path` with ?upgrade=<interval> set, the marker that resumes checkout after signing up. */
export function withUpgrade(path: string, interval: "month" | "year"): string {
  return withParam(path, "upgrade", interval);
}

/** `path` with `?key=value` set; keeps other params and the hash. */
export function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, "http://x");
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}
