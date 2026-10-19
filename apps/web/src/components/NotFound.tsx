import { Link } from "@tanstack/react-router";

export function NotFound({ what = "page" }: { what?: string }) {
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1>We couldn't find that {what}</h1>
      <p className="muted">It may have moved, or the link may be mistyped.</p>
      <Link to="/" hash="courses" className="button primary">
        Browse courses
      </Link>
    </div>
  );
}
