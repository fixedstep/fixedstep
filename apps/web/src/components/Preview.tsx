import { useEffect, useRef, useState } from "react";

/**
 * Canvas preview for `sim` lessons and playgrounds. A new worker per run (runId change); the
 * old one is terminated. With `live`, code changes are hot-swapped into the running worker.
 */
export function Preview({
  code,
  runId,
  live = false,
  autoFocus = true,
}: {
  code: string;
  runId: number;
  live?: boolean;
  autoFocus?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restart only when runId changes
  useEffect(() => {
    if (runId === 0 || !wrap.current) return;
    setError(null);
    // A canvas can only transferControlToOffscreen once, so make a fresh one per run.
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    canvas.tabIndex = 0;
    wrap.current.replaceChildren(canvas);

    const w = new Worker(new URL("../workers/preview.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e: MessageEvent<{ type: "error"; message: string } | { type: "ok" }>) => {
      setError(e.data.type === "error" ? e.data.message : null);
    };
    const offscreen = canvas.transferControlToOffscreen();
    w.postMessage({ type: "start", code, canvas: offscreen }, [offscreen]);

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      e.preventDefault();
      w.postMessage({ type: "key", key: e.key, down });
    };
    canvas.addEventListener("keydown", onKey(true));
    canvas.addEventListener("keyup", onKey(false));
    if (autoFocus) canvas.focus();

    return () => {
      w.terminate();
      worker.current = null;
    };
  }, [runId]);

  useEffect(() => {
    if (live) worker.current?.postMessage({ type: "reload", code });
  }, [code, live]);

  return (
    <div className="preview">
      <div ref={wrap} className="preview-canvas">
        {runId === 0 && <p className="muted">Press Run to start the preview.</p>}
      </div>
      {error && <pre className="error">{error}</pre>}
    </div>
  );
}
