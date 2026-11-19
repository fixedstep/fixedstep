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
 * Query params that change where a connection goes. postgres.js dials the URL hostname and
 * only forwards these as startup parameters, but libpq and other clients honour them, so any
 * of them makes the URL not provably local.
 */
const TARGET_PARAMS = ["hostaddr", "port", "service"];

/**
 * Fails closed: anything we can't positively identify as local (unparseable, multi-host,
 * empty host, non-loopback IP, any other name) is refused. No DNS lookups.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  // WHATWG URL splits userinfo at the last `@`, postgres.js at the first, and postgres.js reads
  // a comma there as a host list; refuse any raw authority where the two could disagree.
  const authority = /^[^:/?#]+:\/\/([^/?#]*)/.exec(url)?.[1] ?? "";
  if (authority.includes(",") || authority.split("@").length > 2) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (TARGET_PARAMS.some((p) => parsed.searchParams.has(p))) return false;
  // An empty host would fall back to PGHOST, which could be anything.
  const host = parsed.hostname.toLowerCase();
  if (host === "" || !LOCAL_DB_HOSTS.has(host)) return false;
  // libpq's `?host=` overrides the URL host, so it must also be one local value (a unix socket
  // dir is local). A comma makes a multi-host list, and a repeated key is ambiguous.
  const hostParams = parsed.searchParams.getAll("host");
  if (hostParams.length === 0) return true;
  if (hostParams.length > 1) return false;
  const [hostParam] = hostParams;
  if (hostParam === undefined || hostParam.includes(",")) return false;
  return hostParam.startsWith("/") || LOCAL_DB_HOSTS.has(hostParam.toLowerCase());
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
  const host = parsed.hostname || "(empty)";
  const hostParams = parsed.searchParams.getAll("host");
  return hostParams.length > 0 ? `${host} (?host=${hostParams.join("&host=")})` : host;
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
