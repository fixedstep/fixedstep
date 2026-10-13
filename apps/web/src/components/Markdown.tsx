import { useState } from "react";
import ReactMarkdown from "react-markdown";

type Segment =
  | { type: "md"; text: string }
  | { type: "tabs"; group: string; blocks: { lang: string; code: string }[] };

const LANG_LABELS: Record<string, string> = {
  ts: "TypeScript",
  cpp: "C++",
  csharp: "C#",
  odin: "Odin",
};

/**
 * Splits markdown so consecutive fenced blocks with the same `group=<name>` render as one
 * tabbed snippet (the "same idea in C++ / C# / Odin" convention from the content README).
 */
export function splitSnippetGroups(md: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /^```(\w+)[^\n]*\bgroup=([\w-]+)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;
  let last = 0;
  for (const m of md.matchAll(fence)) {
    const [whole, lang = "", group = "", code = ""] = m;
    const between = md.slice(last, m.index);
    const prev = segments.at(-1);
    if (prev?.type === "tabs" && prev.group === group && between.trim() === "") {
      prev.blocks.push({ lang, code: code.trimEnd() });
    } else {
      if (between.trim()) segments.push({ type: "md", text: between });
      segments.push({ type: "tabs", group, blocks: [{ lang, code: code.trimEnd() }] });
    }
    last = m.index + whole.length;
  }
  const rest = md.slice(last);
  if (rest.trim()) segments.push({ type: "md", text: rest });
  return segments;
}

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
      {splitSnippetGroups(source).map((s, i) =>
        s.type === "md" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are static per render
          <ReactMarkdown key={i}>{s.text}</ReactMarkdown>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are static per render
          <SnippetTabs key={i} blocks={s.blocks} />
        ),
      )}
    </div>
  );
}
