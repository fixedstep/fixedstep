import type { CourseOutline, LessonSummary } from "@fixedstep/content-schema";
import { Link } from "@tanstack/react-router";
import { KIND_ICON, KIND_LABEL } from "../../lib/lesson-kind";

export const allLessons = (course: CourseOutline) => course.chapters.flatMap((ch) => ch.lessons);

export function courseProgress(course: CourseOutline) {
  const lessons = allLessons(course);
  const done = lessons.filter((l) => l.completed).length;
  return { done, total: lessons.length, pct: lessons.length ? (done / lessons.length) * 100 : 0 };
}

export function CourseCatalog({
  courses,
  signedIn,
}: {
  courses: CourseOutline[];
  signedIn: boolean;
}) {
  if (courses.length === 0) return <p className="muted">No courses published yet.</p>;
  return (
    <div className="course-list">
      {courses.map((course) => (
        <CourseCard key={course.slug} course={course} signedIn={signedIn} />
      ))}
    </div>
  );
}

function CourseCard({ course, signedIn }: { course: CourseOutline; signedIn: boolean }) {
  const lessons = allLessons(course);
  const free = lessons.filter((l) => l.access === "free").length;
  const xp = lessons.reduce((sum, l) => sum + l.xp, 0);
  const progress = courseProgress(course);

  return (
    <section className="course-card">
      <header className="course-card-head">
        <div>
          <h3>{course.title}</h3>
          <p className="muted">{course.description}</p>
        </div>
        <dl className="course-stats">
          <div>
            <dt>Lessons</dt>
            <dd>{lessons.length}</dd>
          </div>
          <div>
            <dt>Free</dt>
            <dd>{free}</dd>
          </div>
          <div>
            <dt>XP</dt>
            <dd>{xp}</dd>
          </div>
        </dl>
      </header>
      {signedIn && (
        <div className="progress">
          <div
            className="progress-bar"
            role="progressbar"
            aria-label={`${course.title} progress`}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <span style={{ width: `${progress.pct}%` }} />
          </div>
          <span className="muted">
            {progress.done}/{progress.total} complete
          </span>
        </div>
      )}
      <div className="chapters">
        {course.chapters.map((chapter, i) => (
          <div key={chapter.slug} className="chapter">
            <h4>
              <span className="chapter-num">{String(i + 1).padStart(2, "0")}</span>
              {chapter.title}
            </h4>
            <ol className="lesson-list">
              {chapter.lessons.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function LessonRow({ lesson }: { lesson: LessonSummary }) {
  return (
    <li className={lesson.completed ? "done" : undefined}>
      <Link to="/lessons/$lessonId" params={{ lessonId: lesson.id }}>
        <span className="lesson-icon" title={KIND_LABEL[lesson.kind]} aria-hidden>
          {KIND_ICON[lesson.kind]}
        </span>
        <span className="lesson-title">{lesson.title}</span>
        <span className="lesson-meta">
          {lesson.access === "paid" && <span className="badge">PRO</span>}
          <span className="muted">{lesson.xp} XP</span>
          {lesson.completed && (
            <span className="check" title="Completed">
              ✓
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
