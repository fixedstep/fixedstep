import type { LoadedCourse } from "./load";

export const PREVIEW_FLAG = "--preview";

/** Hosts that count as this machine or the compose network. `[::1]` is how URL.hostname spells IPv6. */
export const LOCAL_DB_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "postgres",
]);

/** Takes `--preview` out of argv wherever it appears, so `pnpm content:preview ../dir` works. */
export function splitPreviewFlag(argv: string[]): { preview: boolean; args: string[] } {
  return {
    preview: argv.includes(PREVIEW_FLAG),
    args: argv.filter((a) => a !== PREVIEW_FLAG),
  };
}

/**
 * Fails closed: anything we can't positively identify as local (unparseable, multi-host,
 * empty host, non-loopback IP, any other name) is refused. No DNS lookups.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // libpq/postgres.js style `?host=` overrides the URL host; a unix socket dir is local.
  const hostParam = parsed.searchParams.get("host");
  if (hostParam !== null) {
    return hostParam.startsWith("/") || LOCAL_DB_HOSTS.has(hostParam.toLowerCase());
  }
  // An empty host would fall back to PGHOST, which could be anything.
  const host = parsed.hostname.toLowerCase();
  return host !== "" && LOCAL_DB_HOSTS.has(host);
}

/** Names the host for an error message. Never the full URL: it contains the password. */
function describeHost(url: string | undefined): string {
  if (!url) return "unset";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "unparseable";
  }
  return parsed.searchParams.get("host") ?? (parsed.hostname || "(empty)");
}

export function assertPreviewDatabase(url: string | undefined): void {
  if (url && isLocalDatabaseUrl(url)) return;
  throw new Error(
    `--preview only runs against a local database (localhost, 127.0.0.1, ::1 or the compose "postgres" host); DATABASE_URL host is ${describeHost(url)}`,
  );
}

/** Every course published, for the local database only. Returns copies; the input is unchanged. */
export function asPreview(courses: LoadedCourse[]): LoadedCourse[] {
  return courses.map((c) => ({ ...c, published: true }));
}
