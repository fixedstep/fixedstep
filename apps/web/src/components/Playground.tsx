import { applyTweak, parseTweaks } from "@fixedstep/content-schema/markdown";
import { useEffect, useMemo, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { EditorThemePicker } from "./EditorThemePicker";
import { Preview } from "./Preview";

/**
 * An inline ```ts playground block: editor + live canvas, plus a slider for every
 * `// @range` constant. Sliders rewrite the literal in the code, so the editor always
 * shows the value that's running. Nothing here is graded or saved.
 */
export function Playground({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [liveCode, setLiveCode] = useState(initialCode);
  const [runId, setRunId] = useState(1);
  const tweaks = useMemo(() => parseTweaks(code), [code]);

  // Typing is debounced so half-written code doesn't spam errors; sliders feel instant anyway.
  useEffect(() => {
    const t = setTimeout(() => setLiveCode(code), 250);
    return () => clearTimeout(t);
  }, [code]);

  const setTweak = (name: string, value: number) => {
    const tweak = tweaks.find((t) => t.name === name);
    if (!tweak) return;
    const next = applyTweak(code, tweak, value);
    setCode(next);
    setLiveCode(next);
  };

  return (
    <div className="playground">
      <div className="playground-main">
        <CodeEditor value={code} onChange={setCode} className="editor-compact" />
        <div className="playground-side">
          <Preview code={liveCode} runId={runId} live autoFocus={false} />
          {tweaks.length > 0 && (
            <div className="tweaks">
              {tweaks.map((t) => (
                <label key={t.name}>
                  <span className="tweak-name">{t.name}</span>
                  <input
                    type="range"
                    min={t.min}
                    max={t.max}
                    step={t.step}
                    value={t.value}
                    onChange={(e) => setTweak(t.name, Number(e.target.value))}
                  />
                  <output>{t.value}</output>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="actions">
        <button type="button" onClick={() => setRunId((n) => n + 1)}>
          ↻ Restart
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setCode(initialCode);
            setLiveCode(initialCode);
            setRunId((n) => n + 1);
          }}
        >
          Reset code
        </button>
        <span className="muted playground-hint">
          Edit the code or drag a slider; the canvas updates live.
        </span>
        <EditorThemePicker />
      </div>
    </div>
  );
}
