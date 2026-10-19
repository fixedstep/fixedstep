import type { GradeResult } from "@fixedstep/content-schema";

export type Run = { result: GradeResult; stale: boolean };

const STATUS_LABEL = { passed: "✅ passed", failed: "❌ failed", error: "⚠️ error" } as const;

/**
 * Local test runs and the server check side by side. Rows are the union of both runs'
 * tests; hidden tests only ever come from the server. A run is stale once the code changes.
 */
export function ResultsPanel({ local, server }: { local: Run | null; server: Run | null }) {
  if (!local && !server) return null;

  const names: string[] = [];
  for (const r of [...(local?.result.results ?? []), ...(server?.result.results ?? [])]) {
    if (!names.includes(r.name)) names.push(r.name);
  }
  const find = (run: Run | null, name: string) => run?.result.results.find((r) => r.name === name);
  const headline = server && !server.stale ? server : (local ?? server);

  return (
    <section className={`results ${headline?.result.status ?? ""}`} aria-live="polite">
      <h3>
        {headline === server ? "Server check" : "Local tests"}:{" "}
        {headline && STATUS_LABEL[headline.result.status]}
      </h3>
      {local?.result.error && <pre className="error">Local: {local.result.error}</pre>}
      {server?.result.error && <pre className="error">Server: {server.result.error}</pre>}
      {names.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col" className={local?.stale ? "stale" : undefined}>
                Local{local?.stale && <span className="muted"> (outdated)</span>}
              </th>
              <th scope="col" className={server?.stale ? "stale" : undefined}>
                Server{server?.stale && <span className="muted"> (outdated)</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {names.map((name) => {
              const l = find(local, name);
              const s = find(server, name);
              const error = (s && !s.passed && s.error) || (l && !l.passed && l.error);
              return (
                <tr key={name}>
                  <th scope="row">
                    {name}
                    {s?.hidden && <span className="muted"> (hidden)</span>}
                    {error && <div className="muted test-error">{error}</div>}
                  </th>
                  <Cell result={l} stale={local?.stale} />
                  <Cell result={s} stale={server?.stale} />
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Cell({ result, stale }: { result?: { passed: boolean }; stale?: boolean }) {
  if (!result) return <td className="muted">—</td>;
  const cls = [result.passed ? "pass" : "fail", stale && "stale"].filter(Boolean).join(" ");
  return (
    <td className={cls} title={result.passed ? "Passed" : "Failed"}>
      {result.passed ? "✓" : "✗"}
    </td>
  );
}
