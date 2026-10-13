/**
 * Fixed-window in-memory rate limiter. Good enough for one or two API tasks; with more
 * tasks the effective limit multiplies, so move this to Postgres or Redis when scaling out.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = Date.now();

  return function allow(key: string): boolean {
    const now = Date.now();
    if (now - lastSweep > opts.windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      lastSweep = now;
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= opts.limit;
  };
}
