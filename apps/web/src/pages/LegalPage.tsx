import ReactMarkdown from "react-markdown";

/** The privacy policy and terms. Plain react-markdown: `components/Markdown` splits playgrounds. */
export function LegalPage({ source }: { source: string }) {
  return (
    <article className="legal prose">
      <ReactMarkdown>{source}</ReactMarkdown>
    </article>
  );
}
