import type { CourseOutline, LessonKind } from "@fixedstep/content-schema";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../lib/api";
import { findLessonContext, type LessonContext } from "../lib/course-nav";
import { KIND_ICON, KIND_LABEL } from "../lib/lesson-kind";
import { rateAccess } from "../lib/rating";
import { GuestNudge } from "./GuestNudge";
import { RatingSummary, StarRating } from "./StarRating";

const WIDE = "(min-width: 1024px)";

/**
 * Course chrome around a lesson: breadcrumb, collapsible outline and prev/next. Built from the
 * cached /courses outline, so it also frames the paywall. Lessons missing from the outline
 * (or before it loads) render bare.
 */
export function LessonShell({ lessonId, children }: { lessonId: string; children: ReactNode }) {
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });
  const ctx = courses.data ? findLessonContext(courses.data, lessonId) : null;
  const [open, setOpen] = useOutlineOpen(lessonId, ctx?.lesson.kind);

  if (!ctx) return <>{children}</>;
  return (
    <div className={`lesson-shell${open ? " outline-open" : ""}`}>
      <div className="lesson-bar">
        <button
          type="button"
          className="outline-toggle"
          aria-expanded={open}
          aria-controls="course-outline"
          onClick={() => setOpen(!open)}
        >
          ☰ <span className="outline-toggle-label">{open ? "Hide outline" : "Outline"}</span>
        </button>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/" hash="courses">
            Courses
          </Link>
          <span aria-hidden>›</span>
          <span>{ctx.course.title}</span>
          <span aria-hidden>›</span>
          <span aria-current="page">{ctx.chapter.title}</span>
        </nav>
        <BarRating course={ctx.course} />
      </div>
      {open && (
        <button
          type="button"
          className="outline-backdrop"
          aria-label="Close outline"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}
      <Outline ctx={ctx} hidden={!open} />
      <div className="lesson-main">
        {children}
        <PrevNext ctx={ctx} />
      </div>
    </div>
  );
}

/**
 * The course rating in the always-visible bar: the summary for everyone, the stars for a learner
 * who may rate. Keyed by slug so moving to another course's lesson doesn't carry the widget's
 * unsent state (or its debounced PUT) over to the new course. `can-rate` reserves the
 * save-status slot beside the summary (styles.css).
 */
function BarRating({ course }: { course: CourseOutline }) {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const canRate = rateAccess(me.data, course) === "rate";
  return (
    // biome-ignore lint/a11y/useSemanticElements: not a form group; a fieldset would wrap the stars' own fieldset and resist shrinking
    <div
      className={canRate ? "lesson-rating can-rate" : "lesson-rating"}
      role="group"
      aria-label="Course rating"
    >
      <RatingSummary rating={course.rating} emptyText="Not enough ratings yet" />
      {canRate && <StarRating key={course.slug} course={course} />}
    </div>
  );
}

function Outline({ ctx, hidden }: { ctx: LessonContext; hidden: boolean }) {
  const lessons = ctx.course.chapters.flatMap((ch) => ch.lessons);
  const done = lessons.filter((l) => l.completed).length;
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const access = rateAccess(me.data, ctx.course);
  return (
    <nav id="course-outline" className="course-outline" aria-label="Course outline" hidden={hidden}>
      <header>
        <strong>{ctx.course.title}</strong>
        <span className="muted">
          {done}/{lessons.length} complete
        </span>
        {access === "guest" && <GuestNudge message="Create a free account to rate this course." />}
      </header>
      {ctx.course.chapters.map((chapter, i) => (
        <section key={chapter.slug}>
          <h4>
            <span className="chapter-num">{String(i + 1).padStart(2, "0")}</span>
            {chapter.title}
          </h4>
          <ol>
            {chapter.lessons.map((l) => (
              <li key={l.id} className={l.completed ? "done" : undefined}>
                <Link
                  to="/lessons/$lessonId"
                  params={{ lessonId: l.id }}
                  aria-current={l.id === ctx.lesson.id ? "page" : undefined}
                >
                  <span className="lesson-icon" title={KIND_LABEL[l.kind]} aria-hidden>
                    {KIND_ICON[l.kind]}
                  </span>
                  <span className="lesson-title">{l.title}</span>
                  {l.completed ? (
                    <span className="check" title="Completed">
                      ✓
                    </span>
                  ) : (
                    l.access === "paid" && <span className="badge">PRO</span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </nav>
  );
}

function PrevNext({ ctx }: { ctx: LessonContext }) {
  if (!ctx.prev && !ctx.next) return null;
  return (
    <nav className="prev-next" aria-label="Lesson navigation">
      {ctx.prev ? (
        <Link to="/lessons/$lessonId" params={{ lessonId: ctx.prev.id }} className="prev">
          <span className="muted">← Previous</span>
          <span>{ctx.prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {ctx.next && (
        <Link to="/lessons/$lessonId" params={{ lessonId: ctx.next.id }} className="next">
          <span className="muted">Next →</span>
          <span>{ctx.next.title}</span>
        </Link>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Open state. Wide screens: a remembered preference per lesson group, defaulting to open for
// reading/quiz and collapsed for code/sim (they need the width). Narrow screens: an overlay
// drawer that starts closed and closes on navigation or Escape.

type Group = "text" | "code";
const prefKey = (g: Group) => `fixedstep:outline:${g}`;

function loadPref(g: Group): boolean | undefined {
  try {
    const v = localStorage.getItem(prefKey(g));
    return v === null ? undefined : v === "open";
  } catch {
    return undefined;
  }
}
function savePref(g: Group, open: boolean) {
  try {
    localStorage.setItem(prefKey(g), open ? "open" : "closed");
  } catch {
    // convenience only
  }
}

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
  );
}

function useOutlineOpen(lessonId: string, kind: LessonKind | undefined) {
  const wide = useMediaQuery(WIDE);
  const group: Group = kind === "code" || kind === "sim" ? "code" : "text";
  const [prefs, setPrefs] = useState(() => ({ text: loadPref("text"), code: loadPref("code") }));
  const [drawer, setDrawer] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation
  useEffect(() => setDrawer(false), [lessonId]);

  const open = wide ? (prefs[group] ?? group === "text") : drawer;
  useEffect(() => {
    if (wide || !open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wide, open]);

  const setOpen = (next: boolean) => {
    if (!wide) return setDrawer(next);
    setPrefs((p) => ({ ...p, [group]: next }));
    savePref(group, next);
  };
  return [open, setOpen] as const;
}
