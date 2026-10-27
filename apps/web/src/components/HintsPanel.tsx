import type { HintStatus } from "@fixedstep/content-schema";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";

// Unlocking is decided by the server; how many the learner chose to reveal is only a UI choice.
const revealedKey = (id: string) => `fixedstep:hints-revealed:${id}`;
function loadRevealed(id: string): number {
  try {
    const n = Number(localStorage.getItem(revealedKey(id)));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
function saveRevealed(id: string, n: number) {
  try {
    localStorage.setItem(revealedKey(id), String(n));
  } catch {}
}

/** The hint ladder: hint n unlocks after n failed submissions and is revealed on click, in order. */
export function HintsPanel({ lessonId, status }: { lessonId: string; status: HintStatus }) {
  const headingId = useId();
  const [stored, setStored] = useState(() => loadRevealed(lessonId));
  const revealed = Math.min(stored, status.unlocked);
  const hints = useQuery({
    queryKey: ["hints", lessonId, status.unlocked],
    queryFn: () => api.hints(lessonId),
    enabled: revealed > 0,
  });

  if (status.total === 0) return null;

  const reveal = (n: number) => {
    setStored(n);
    saveRevealed(lessonId, n);
  };

  return (
    <section className="hints-panel" aria-labelledby={headingId}>
      <h3 id={headingId}>Hints</h3>
      <ol>
        {Array.from({ length: status.total }, (_, i) => {
          const n = i + 1;
          const remaining = n - status.unlocked;
          let content: ReactNode;
          if (n <= revealed) {
            const text = hints.data?.hints[i];
            content =
              text !== undefined ? (
                <div className="prose">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              ) : (
                <p className="muted hint-note">
                  {hints.isError ? "Couldn't load this hint." : "Loading…"}
                </p>
              );
          } else if (n === revealed + 1 && n <= status.unlocked) {
            content = (
              <button type="button" onClick={() => reveal(n)}>
                Show hint {n}
              </button>
            );
          } else if (n <= status.unlocked) {
            content = <p className="muted hint-note">Show hint {revealed + 1} first</p>;
          } else {
            content = (
              <p className="muted hint-note">
                {remaining === 1
                  ? "Unlocks after another failed submission"
                  : `Unlocks after ${remaining} more failed submissions`}
              </p>
            );
          }
          return (
            <li key={n}>
              <p className="hint-label">
                Hint {n} of {status.total}
              </p>
              {content}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
