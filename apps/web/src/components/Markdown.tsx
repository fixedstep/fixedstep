import { splitLessonMarkdown } from "@fixedstep/content-schema/markdown";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Playground } from "./Playground";

const LANG_LABELS: Record<string, string> = {
  ts: "TypeScript",
  cpp: "C++",
  csharp: "C#",
  odin: "Odin",
};

function SnippetTabs({ blocks }: { blocks: { lang: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  const block = blocks[active] ?? blocks[0];
  return (
    <div className="snippet-tabs">
      <div className="tab-row" role="tablist">
        {blocks.map((b, i) => (
          <button
            key={b.lang}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={i === active ? "tab active" : "tab"}
            onClick={() => setActive(i)}
          >
            {LANG_LABELS[b.lang] ?? b.lang}
          </button>
        ))}
      </div>
      <pre>
        <code>{block?.code}</code>
      </pre>
    </div>
  );
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose">
      {splitLessonMarkdown(source).map((s, i) => {
        // biome-ignore-start lint/suspicious/noArrayIndexKey: segments are static per render
        if (s.type === "md") return <ReactMarkdown key={i}>{s.text}</ReactMarkdown>;
        if (s.type === "tabs") return <SnippetTabs key={i} blocks={s.blocks} />;
        return <Playground key={i} initialCode={s.code} />;
        // biome-ignore-end lint/suspicious/noArrayIndexKey: segments are static per render
      })}
    </div>
  );
}
