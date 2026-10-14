/**
 * Markdown conventions inside lesson bodies, shared by the web renderer and content CI.
 *
 * - Consecutive fenced blocks with the same `group=<name>` render as one tabbed snippet:
 *     ```cpp group=loop   followed by   ```csharp group=loop
 * - A ```ts playground block renders as a live editor + canvas. Its code exports
 *   init / update / render like a sim lesson, and top-level numeric constants annotated
 *   with `// @range <min>..<max> [step <n>]` get a slider:
 *     const GRAVITY = 900; // @range 0..2000 step 10
 */

export type Segment =
  | { type: "md"; text: string }
  | { type: "tabs"; group: string; blocks: { lang: string; code: string }[] }
  | { type: "playground"; code: string };

const FENCE = /^```(\w+)([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;

export function splitLessonMarkdown(md: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of md.matchAll(FENCE)) {
    const [whole, lang = "", info = "", body = ""] = m;
    const code = body.trimEnd();
    const group = /\bgroup=([\w-]+)/.exec(info)?.[1];
    const playground = /\bplayground\b/.test(info);
    if (!group && !playground) continue; // ordinary fence: left to the markdown renderer

    const between = md.slice(last, m.index);
    const prev = segments.at(-1);
    if (group && prev?.type === "tabs" && prev.group === group && between.trim() === "") {
      prev.blocks.push({ lang, code });
    } else {
      if (between.trim()) segments.push({ type: "md", text: between });
      segments.push(
        playground
          ? { type: "playground", code }
          : { type: "tabs", group: group ?? "", blocks: [{ lang, code }] },
      );
    }
    last = m.index + whole.length;
  }
  const rest = md.slice(last);
  if (rest.trim()) segments.push({ type: "md", text: rest });
  return segments;
}

export type Tweak = {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Offsets of the numeric literal in the source, for rewriting it. */
  start: number;
  end: number;
};

const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
const TWEAK = new RegExp(
  String.raw`^[ \t]*(?:export[ \t]+)?(?:const|let)[ \t]+(\w+)(?:[ \t]*:[ \t]*number)?[ \t]*=[ \t]*(${NUM})[ \t]*;?[ \t]*//[ \t]*@range[ \t]+(${NUM})[ \t]*\.\.[ \t]*(${NUM})(?:[ \t]+step[ \t]+(${NUM}))?[ \t]*$`,
  "gm",
);

/** Finds `const NAME = <number>; // @range min..max [step n]` lines. */
export function parseTweaks(code: string): Tweak[] {
  const tweaks: Tweak[] = [];
  for (const m of code.matchAll(TWEAK)) {
    const [line, name = "", literal = "", min = "", max = "", step] = m;
    const lo = Number(min);
    const hi = Number(max);
    if (!(hi > lo)) continue;
    const start = m.index + line.indexOf(literal, line.indexOf("="));
    const isInt = [literal, min, max].every((s) => !s.includes("."));
    tweaks.push({
      name,
      value: Number(literal),
      min: lo,
      max: hi,
      step: step ? Number(step) : isInt ? 1 : (hi - lo) / 100,
      start,
      end: start + literal.length,
    });
  }
  return tweaks;
}

/** Rewrites a tweak's literal, rounded to its step's precision. */
export function applyTweak(code: string, tweak: Tweak, value: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(tweak.step) + 1e-9));
  const text = String(Number(value.toFixed(Math.min(decimals, 10))));
  return code.slice(0, tweak.start) + text + code.slice(tweak.end);
}
