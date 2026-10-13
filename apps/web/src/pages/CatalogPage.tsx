import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";

const KIND_ICON = { reading: "📖", quiz: "❓", code: "⌨️", sim: "🎮" } as const;

export function CatalogPage() {
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });

  if (courses.isPending) return <p className="muted">Loading…</p>;
  if (courses.isError) return <p className="error">Couldn't load courses.</p>;

  return (
    <div className="catalog">
      {courses.data.map((course) => (
        <section key={course.slug} className="course">
          <h1>{course.title}</h1>
          <p className="muted">{course.description}</p>
          {course.chapters.map((chapter) => (
            <div key={chapter.slug} className="chapter">
              <h2>{chapter.title}</h2>
              <ol>
                {chapter.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link to="/lessons/$lessonId" params={{ lessonId: lesson.id }}>
                      {KIND_ICON[lesson.kind]} {lesson.title}
                    </Link>
                    {lesson.completed && <span title="Completed"> ✅</span>}
                    {lesson.access === "paid" && <span className="badge">PRO</span>}
                    <span className="muted"> · {lesson.xp} XP</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
