import { useEffect, useRef, useState } from "react";

/** Canvas preview for `sim` lessons. A new worker per run; the old one is terminated. */
export function Preview({ code, runId }: { code: string; runId: number }) {
  const wrap = useRef<HTMLDivElement>(null);
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

    const worker = new Worker(new URL("../workers/preview.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<{ type: "error"; message: string }>) => {
      setError(e.data.message);
      worker.terminate();
    };
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ type: "start", code, canvas: offscreen }, [offscreen]);

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      e.preventDefault();
      worker.postMessage({ type: "key", key: e.key, down });
    };
    const keydown = onKey(true);
    const keyup = onKey(false);
    canvas.addEventListener("keydown", keydown);
    canvas.addEventListener("keyup", keyup);
    canvas.focus();

    return () => worker.terminate();
  }, [runId]);

  return (
    <div className="preview">
      <div ref={wrap} className="preview-canvas">
        {runId === 0 && <p className="muted">Press Run to start the preview.</p>}
      </div>
      {error && <pre className="error">{error}</pre>}
    </div>
  );
}
