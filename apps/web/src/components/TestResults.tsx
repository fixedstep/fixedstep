import type { GradeResult } from "@fixedstep/content-schema";

export function TestResults({ result, title }: { result: GradeResult; title: string }) {
  return (
    <section className={`results ${result.status}`}>
      <h3>
        {title}:{" "}
        {result.status === "passed"
          ? "✅ passed"
          : result.status === "failed"
            ? "❌ failed"
            : "⚠️ error"}
      </h3>
      {result.error && <pre className="error">{result.error}</pre>}
      <ul>
        {result.results.map((r) => (
          <li key={r.name} className={r.passed ? "pass" : "fail"}>
            {r.passed ? "✓" : "✗"} {r.name}
            {r.hidden && <span className="muted"> (hidden)</span>}
            {r.error && <div className="muted">{r.error}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
