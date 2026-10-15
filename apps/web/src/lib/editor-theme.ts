import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useSyncExternalStore } from "react";

/**
 * Editor colors are CSS variables (--cm-*) set on <html>, so switching palettes restyles every
 * open editor without reconfiguring CodeMirror. "auto" follows the OS light/dark setting like
 * the rest of the site. The choice is a per-browser convenience in localStorage.
 */

type Palette = {
  bg: string;
  fg: string;
  gutterFg: string;
  activeLine: string;
  selection: string;
  cursor: string;
  match: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  function: string;
  type: string;
  property: string;
  operator: string;
  punct: string;
  invalid: string;
};

const PALETTES = {
  light: {
    bg: "#ffffff",
    fg: "#14172b",
    gutterFg: "#a0a5c0",
    activeLine: "#f4f5fa",
    selection: "#ffe5ad",
    cursor: "#d9930d",
    match: "#d9930d55",
    keyword: "#7c3aed",
    string: "#1f7a3d",
    number: "#b45309",
    comment: "#737a9c",
    function: "#1d5fd1",
    type: "#0e7490",
    property: "#a3367a",
    operator: "#5d6280",
    punct: "#5d6280",
    invalid: "#c0392b",
  },
  dark: {
    bg: "#0f1528",
    fg: "#e8eaf6",
    gutterFg: "#4d5580",
    activeLine: "#151d38",
    selection: "#2d3b6e",
    cursor: "#ffd166",
    match: "#ffd16655",
    keyword: "#c792ea",
    string: "#a6e3a1",
    number: "#ffb86c",
    comment: "#6f77a0",
    function: "#82aaff",
    type: "#7fdbca",
    property: "#f78cbc",
    operator: "#89ddff",
    punct: "#9aa0c3",
    invalid: "#ff6b6b",
  },
  contrast: {
    bg: "#000000",
    fg: "#ffffff",
    gutterFg: "#8a8a8a",
    activeLine: "#1a1a1a",
    selection: "#264f78",
    cursor: "#ffd166",
    match: "#ffd16677",
    keyword: "#ff9cf5",
    string: "#7dff9b",
    number: "#ffcf5c",
    comment: "#b3b3b3",
    function: "#6cc4ff",
    type: "#5ff2e6",
    property: "#ffb3d9",
    operator: "#ffffff",
    punct: "#d0d0d0",
    invalid: "#ff5c5c",
  },
} satisfies Record<string, Palette>;

export const EDITOR_THEMES = [
  { id: "auto", label: "Auto" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "contrast", label: "High contrast" },
] as const;
export type EditorThemeId = (typeof EDITOR_THEMES)[number]["id"];

const STORAGE_KEY = "fixedstep:editor-theme";
const darkQuery =
  typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
const listeners = new Set<() => void>();

function load(): EditorThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (EDITOR_THEMES.some((th) => th.id === v)) return v as EditorThemeId;
  } catch {
    // storage unavailable; fall back to auto
  }
  return "auto";
}

let current = load();

function apply() {
  const id = current === "auto" ? (darkQuery?.matches ? "dark" : "light") : current;
  const style = document.documentElement.style;
  for (const [k, v] of Object.entries(PALETTES[id])) {
    style.setProperty(`--cm-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v);
  }
}

apply();
darkQuery?.addEventListener("change", () => current === "auto" && apply());

export function setEditorTheme(id: EditorThemeId) {
  current = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // convenience only
  }
  apply();
  for (const l of listeners) l();
}

export function useEditorTheme(): EditorThemeId {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

const highlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.modifier],
    color: "var(--cm-keyword)",
  },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--cm-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--cm-number)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: "var(--cm-comment)",
    fontStyle: "italic",
  },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--cm-function)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--cm-type)" },
  { tag: t.propertyName, color: "var(--cm-property)" },
  {
    tag: [t.operator, t.arithmeticOperator, t.logicOperator, t.compareOperator],
    color: "var(--cm-operator)",
  },
  { tag: [t.punctuation, t.bracket, t.separator], color: "var(--cm-punct)" },
  { tag: t.invalid, color: "var(--cm-invalid)" },
]);

const base = EditorView.theme({
  "&": { color: "var(--cm-fg)", backgroundColor: "var(--cm-bg)", fontSize: "14px" },
  ".cm-scroller": {
    fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace',
    lineHeight: "1.6",
  },
  ".cm-content": { caretColor: "var(--cm-cursor)", padding: "8px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--cm-cursor)", borderLeftWidth: "2px" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--cm-selection)" },
  ".cm-activeLine": { backgroundColor: "var(--cm-active-line)" },
  ".cm-gutters": {
    backgroundColor: "var(--cm-bg)",
    color: "var(--cm-gutter-fg)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-activeLineGutter": { backgroundColor: "var(--cm-active-line)", color: "var(--cm-fg)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--cm-match)", outline: "none" },
  ".cm-selectionMatch": { backgroundColor: "var(--cm-match)" },
  ".cm-tooltip": {
    backgroundColor: "var(--cm-bg)",
    color: "var(--cm-fg)",
    border: "1px solid var(--border)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--cm-selection)",
    color: "var(--cm-fg)",
  },
});

/** Colors, font and 2-space indentation; add after basicSetup so it wins. */
export const editorTheme: Extension = [
  base,
  syntaxHighlighting(highlight),
  indentUnit.of("  "),
  EditorState.tabSize.of(2),
];
