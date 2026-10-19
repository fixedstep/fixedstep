/** Placeholder blocks shown while content loads; screen readers get the text label instead. */
export function LessonSkeleton() {
  return (
    <div className="skeleton-lesson" aria-busy="true">
      <span className="sr-only">Loading lesson…</span>
      <div className="skeleton skeleton-title" />
      {[92, 100, 86, 97, 60].map((w) => (
        <div key={w} className="skeleton skeleton-line" style={{ width: `${w}%` }} />
      ))}
      <div className="skeleton skeleton-block" />
    </div>
  );
}

export function CourseListSkeleton() {
  return (
    <div className="course-list" aria-busy="true">
      <span className="sr-only">Loading courses…</span>
      {[0, 1].map((i) => (
        <div key={i} className="course-card">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" style={{ width: "70%" }} />
          {[0, 1, 2, 3].map((j) => (
            <div key={j} className="skeleton skeleton-row" />
          ))}
        </div>
      ))}
    </div>
  );
}
