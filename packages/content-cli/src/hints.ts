const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SEPARATOR = /^---[ \t]*$/;

/**
 * Parses hints.md: hints are separated by lines that are exactly `---` (trailing spaces allowed)
 * outside fenced code blocks. `<!-- … -->` comments outside fences are dropped and each hint is
 * trimmed. A blank (or comment-only) file has no hints. `empty` lists the 1-based indexes of
 * hints that are blank, e.g. from two separators in a row.
 */
export function parseHints(md: string): { hints: string[]; empty: number[] } {
  const parts: string[][] = [[]];
  let fence: string | null = null;
  let inComment = false;

  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    const current = parts[parts.length - 1] as string[];
    if (fence !== null) {
      current.push(line);
      const close = FENCE.exec(line)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) fence = null;
      continue;
    }

    let rest = line;
    let kept = "";
    while (rest.length > 0) {
      if (inComment) {
        const end = rest.indexOf("-->");
        if (end === -1) {
          rest = "";
        } else {
          rest = rest.slice(end + 3);
          inComment = false;
        }
      } else {
        const start = rest.indexOf("<!--");
        if (start === -1) {
          kept += rest;
          rest = "";
        } else {
          kept += rest.slice(0, start);
          rest = rest.slice(start + 4);
          inComment = true;
        }
      }
    }
    if (kept !== line && kept.trim() === "") continue;

    if (SEPARATOR.test(kept)) {
      parts.push([]);
      continue;
    }
    const m = FENCE.exec(kept);
    if (m?.[1]) fence = m[1];
    current.push(kept);
  }

  const hints = parts.map((p) => p.join("\n").trim());
  if (hints.length === 1 && hints[0] === "") return { hints: [], empty: [] };
  const empty = hints.flatMap((h, i) => (h === "" ? [i + 1] : []));
  return { hints, empty };
}
