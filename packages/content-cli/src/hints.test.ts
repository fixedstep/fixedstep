import { describe, expect, it } from "vitest";
import { parseHints } from "./hints";

describe("parseHints", () => {
  it("parses 1, 3 and 4 hints, trimmed", () => {
    expect(parseHints("  only one \n")).toEqual({ hints: ["only one"], empty: [] });
    expect(parseHints("a\n---\nb\n---\nc\n").hints).toEqual(["a", "b", "c"]);
    expect(parseHints("a\n---\nb\n---\nc\n---\nd").hints).toEqual(["a", "b", "c", "d"]);
  });

  it("doesn't split on --- inside a fence", () => {
    const md = "one\n```ts\nconst a = 1;\n---\n```\nstill one\n---\n~~~\n---\n~~~\ntwo";
    expect(parseHints(md).hints).toEqual([
      "one\n```ts\nconst a = 1;\n---\n```\nstill one",
      "~~~\n---\n~~~\ntwo",
    ]);
  });

  it("keeps *** inside a hint", () => {
    expect(parseHints("a\n***\nb\n---\nc").hints).toEqual(["a\n***\nb", "c"]);
  });

  it("strips comments, and a comment-only file has no hints", () => {
    expect(parseHints("<!--\nformat notes\n---\n-->\n")).toEqual({ hints: [], empty: [] });
    expect(parseHints("")).toEqual({ hints: [], empty: [] });
    expect(parseHints("<!-- intro -->\na <!-- x --> b\n---\nc").hints).toEqual(["a  b", "c"]);
  });

  it("keeps comments inside a fence", () => {
    expect(parseHints("```html\n<!-- kept -->\n```").hints).toEqual([
      "```html\n<!-- kept -->\n```",
    ]);
  });

  it("handles CRLF and trailing spaces on separators", () => {
    expect(parseHints("a\r\n--- \t\r\nb\r\n").hints).toEqual(["a", "b"]);
    // Not a separator: leading space or extra dashes.
    expect(parseHints("a\n ---\nb\n----\nc").hints).toEqual(["a\n ---\nb\n----\nc"]);
  });

  it("reports empty hints by 1-based index", () => {
    expect(parseHints("a\n---\n\n---\nc").empty).toEqual([2]);
    expect(parseHints("a\n---\n<!-- todo -->\n").empty).toEqual([2]);
  });
});
