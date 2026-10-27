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

  describe("edge cases", () => {
    it("treats a file of only separators as empty hints", () => {
      expect(parseHints("---\n---\n")).toEqual({ hints: ["", "", ""], empty: [1, 2, 3] });
      expect(parseHints("---")).toEqual({ hints: ["", ""], empty: [1, 2] });
    });

    it("reports leading and trailing separators as empty hints", () => {
      expect(parseHints("---\na")).toEqual({ hints: ["", "a"], empty: [1] });
      expect(parseHints("a\n---\n")).toEqual({ hints: ["a", ""], empty: [2] });
      expect(parseHints("a\n---\n\n  \n")).toEqual({ hints: ["a", ""], empty: [2] });
    });

    it("doesn't split inside indented fences", () => {
      const md = "a\n  ```\n---\n  ```\nb\n---\nc";
      expect(parseHints(md).hints).toEqual(["a\n  ```\n---\n  ```\nb", "c"]);
    });

    it("needs a closing fence of the same character and at least the same length", () => {
      // ~~~ doesn't close a ``` fence, and a shorter run doesn't either.
      expect(parseHints("```\n~~~\n---\n~~~\n```\n---\nx").hints).toEqual([
        "```\n~~~\n---\n~~~\n```",
        "x",
      ]);
      expect(parseHints("````\n```\n---\n````\n---\nx").hints).toEqual([
        "````\n```\n---\n````",
        "x",
      ]);
    });

    it("keeps everything after an unclosed fence in the same hint", () => {
      expect(parseHints("a\n```\n---\nb").hints).toEqual(["a\n```\n---\nb"]);
    });

    it("splits on --- directly after a closing fence", () => {
      expect(parseHints("```\nx\n```\n---\ny").hints).toEqual(["```\nx\n```", "y"]);
    });

    it("ignores a separator-looking line inside a multi-line comment", () => {
      expect(parseHints("a\n<!--\n---\n-->\nb").hints).toEqual(["a\nb"]);
      expect(parseHints("a\n<!-- x\n---\ny -->\n---\nb").hints).toEqual(["a", "b"]);
    });

    it("reports the line of an unterminated comment", () => {
      expect(parseHints("a\n<!-- never closed\n---\nb").unclosedComment).toBe(2);
      expect(parseHints("<!-- TODO").unclosedComment).toBe(1);
      expect(parseHints("<!-- a -->\nx <!-- b -->\n<!-- c").unclosedComment).toBe(3);
      // A closed comment, or a `<!--` inside a fence, is fine.
      expect(parseHints("<!-- a\nb -->\nc")).not.toHaveProperty("unclosedComment");
      expect(parseHints("```\n<!--\n```\nc")).not.toHaveProperty("unclosedComment");
    });

    it("keeps a --- that follows a comment on the same line as a separator", () => {
      expect(parseHints("a\n---<!-- c -->\nb").hints).toEqual(["a", "b"]);
    });

    it("handles bare CR line endings and CRLF inside fences", () => {
      expect(parseHints("a\r---\rb").hints).toEqual(["a", "b"]);
      expect(parseHints("```\r\n---\r\n```\r\n---\r\nb").hints).toEqual(["```\n---\n```", "b"]);
    });

    it("preserves unicode and non-ASCII whitespace", () => {
      expect(parseHints("héllo 日本語 🎮\n---\nΩ").hints).toEqual(["héllo 日本語 🎮", "Ω"]);
      // A non-breaking space after --- isn't a trailing space/tab, so no split.
      expect(parseHints("a\n---\u00a0\nb").hints).toHaveLength(1);
    });
  });
});
