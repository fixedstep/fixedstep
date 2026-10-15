import { describe, expect, it } from "vitest";
import { applyTweak, parseTweaks, splitLessonMarkdown } from "./markdown";

describe("splitLessonMarkdown", () => {
  it("groups consecutive same-group fences into tabs and leaves plain fences alone", () => {
    const md = [
      "intro",
      "```ts group=loop\na()\n```",
      "",
      "```cpp group=loop\nA();\n```",
      "middle",
      "```ts\nplain()\n```",
      "```ts playground\nexport function init() {}\n```",
      "outro",
    ].join("\n");
    const segs = splitLessonMarkdown(md);
    expect(segs.map((s) => s.type)).toEqual(["md", "tabs", "md", "playground", "md"]);
    const tabs = segs[1];
    expect(tabs?.type === "tabs" && tabs.blocks.map((b) => b.lang)).toEqual(["ts", "cpp"]);
    const mid = segs[2];
    expect(mid?.type === "md" && mid.text).toContain("plain()");
    const pg = segs[3];
    expect(pg?.type === "playground" && pg.code).toBe("export function init() {}");
  });
});

describe("tweaks", () => {
  const code = [
    "const SPEED = 2; // @range 0..10 step 0.1",
    "export const SIZE: number = 12; // @range 2..40",
    "const R = 0.5; // @range 0..1",
    "const NOPE = 3; // just a comment",
    "const BAD = 3; // @range 5..1",
  ].join("\n");

  it("parses annotated numeric constants", () => {
    const t = parseTweaks(code);
    expect(t.map(({ name, value, min, max, step }) => ({ name, value, min, max, step }))).toEqual([
      { name: "SPEED", value: 2, min: 0, max: 10, step: 0.1 },
      { name: "SIZE", value: 12, min: 2, max: 40, step: 1 },
      { name: "R", value: 0.5, min: 0, max: 1, step: 0.01 },
    ]);
  });

  it("rewrites only the literal, rounded to the step", () => {
    const [speed] = parseTweaks(code);
    if (!speed) throw new Error("no tweak");
    const next = applyTweak(code, speed, 3.3000000000000003);
    expect(next.split("\n")[0]).toBe("const SPEED = 3.3; // @range 0..10 step 0.1");
    expect(parseTweaks(next)[0]?.value).toBe(3.3);
  });
});
