import {
  EDITOR_THEMES,
  type EditorThemeId,
  setEditorTheme,
  useEditorTheme,
} from "../lib/editor-theme";

export function EditorThemePicker() {
  const theme = useEditorTheme();
  return (
    <label className="theme-picker muted">
      Theme{" "}
      <select value={theme} onChange={(e) => setEditorTheme(e.target.value as EditorThemeId)}>
        {EDITOR_THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
