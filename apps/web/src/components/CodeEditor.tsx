import { javascript } from "@codemirror/lang-javascript";
import { basicSetup, EditorView } from "codemirror";
import { useEffect, useRef } from "react";
import { editorTheme } from "../lib/editor-theme";

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  className,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor owns its document after mount
  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        basicSetup,
        editorTheme,
        javascript({ typescript: true }),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
        }),
      ],
    });
    return () => view.current?.destroy();
  }, []);

  // External resets (e.g. "Reset to starter") replace the document.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className={className ? `editor ${className}` : "editor"} ref={host} />;
}
