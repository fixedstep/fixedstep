import type { CourseOutline } from "@fixedstep/content-schema";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ManageBillingButton } from "../../components/ManageBillingButton";
import { Playground } from "../../components/Playground";
import { CourseListSkeleton } from "../../components/Skeleton";
import { BillingToggle, UpgradeErrors, useUpgrade } from "../../components/Upgrade";
import { analytics } from "../../lib/analytics";
import { api, type Me } from "../../lib/api";
import { allLessons, CourseCatalog, courseProgress } from "./CourseCatalog";
import { FAQ, GITHUB_URL, PRICING, ROADMAP, STEPS } from "./content";
import heroDemo from "./hero-demo.ts?raw";

const CHECKOUT_POLL_MS = 60_000;

/**
 * Signed out: a landing page (hero demo, how it works, courses, pricing, roadmap, FAQ).
 * Signed in: a "continue" panel, then courses; pricing only for non-Pro users.
 */
export function HomePage() {
  // Back from Polar (?checkout=success): poll /me until the webhook has made the user Pro.
  const [checkoutDone] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success",
  );
  const pollUntil = useRef(Date.now() + CHECKOUT_POLL_MS);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    refetchInterval: (q) =>
      checkoutDone && !q.state.data?.pro && Date.now() < pollUntil.current ? 3000 : false,
  });
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });
  const signedIn = Boolean(me.data?.user);

  // checkout_completed only from the confirmed state (me.pro), never optimistically. A bookmark
  // or back-button revisit of ?checkout=success by a Pro user can double-count; the param is
  // stripped with a history replace so a reload doesn't refire.
  const reported = useRef(false);
  const pro = me.data?.pro;
  useEffect(() => {
    if (!checkoutDone || !pro || reported.current) return;
    reported.current = true;
    analytics.track({ name: "checkout_completed" });
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [checkoutDone, pro]);

  return (
    <div className="home">
      {checkoutDone && (
        <p className="notice">
          🎉 Payment received. Pro unlocks as soon as the payment provider confirms it, usually
          within a few seconds.
        </p>
      )}
      {me.data && signedIn ? (
        <ContinuePanel me={me.data} courses={courses.data ?? []} />
      ) : (
        <Hero courses={courses.data ?? []} />
      )}

      {!signedIn && <HowItWorks />}

      <section id="courses" className="home-section">
        <SectionHead
          eyebrow="Courses"
          title={signedIn ? "Your courses" : "Start with the fundamentals"}
        />
        {courses.isPending && <CourseListSkeleton />}
        {courses.isError && <p className="error">Couldn't load courses.</p>}
        {courses.data && <CourseCatalog courses={courses.data} signedIn={signedIn} />}
      </section>

      {!me.data?.pro && <Pricing />}
      <Roadmap />
      {!signedIn && (
        <>
          <OpenSource />
          <Faq />
        </>
      )}
    </div>
  );
}

function SectionHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="section-head">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {lead && <p className="lead muted">{lead}</p>}
    </header>
  );
}

function firstFreeLesson(courses: CourseOutline[]) {
  return courses.flatMap(allLessons).find((l) => l.access === "free");
}

function Hero({ courses }: { courses: CourseOutline[] }) {
  const start = firstFreeLesson(courses);
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Interactive game development courses</p>
        <h1>
          Learn game development by <em>building games</em>.
        </h1>
        <p className="lead">
          Write real game code in your browser and watch it run, one fixed step at a time. Start
          with the game loop, then movement, collision and input. Friendly if you're new, and deep
          enough if you already code.
        </p>
        <div className="hero-cta">
          {start ? (
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: start.id }}
              className="button primary"
            >
              Start the free lessons
            </Link>
          ) : (
            <a href="#courses" className="button primary">
              Browse courses
            </a>
          )}
          <a href="#pricing" className="button">
            See pricing
          </a>
        </div>
        <ul className="hero-points muted">
          <li>No install</li>
          <li>Free lessons to start</li>
          <li>Open source</li>
        </ul>
      </div>
      <div className="hero-demo">
        <Playground initialCode={heroDemo} variant="hero" />
        <p className="hero-demo-caption muted">
          This cube is about 70 lines of TypeScript on a 2D canvas. It's live, so drag a slider.
        </p>
      </div>
    </section>
  );
}

function ContinuePanel({ me, courses }: { me: Me; courses: CourseOutline[] }) {
  // Resume the first course with progress, else the first course.
  const course =
    courses.find((c) => {
      const p = courseProgress(c);
      return p.done > 0 && p.done < p.total;
    }) ?? courses[0];
  const next = course && allLessons(course).find((l) => !l.completed);
  const progress = course && courseProgress(course);

  return (
    <section className="continue">
      <div>
        <p className="eyebrow">
          Welcome back{me.user && !me.user.isAnonymous ? `, ${me.user.name}` : ""}
        </p>
        {next && course ? (
          <>
            <h1>Pick up where you left off</h1>
            <p className="muted">
              {course.title}
              {progress && ` · ${progress.done}/${progress.total} lessons complete`}
            </p>
            <Link to="/lessons/$lessonId" params={{ lessonId: next.id }} className="button primary">
              Continue: {next.title} →
            </Link>
          </>
        ) : (
          <>
            <h1>You've finished everything so far</h1>
            <p className="muted">New courses are on the way; see the roadmap below.</p>
          </>
        )}
      </div>
      <dl className="continue-stats">
        <div>
          <dt>Streak</dt>
          <dd>🔥 {me.streak}</dd>
        </div>
        <div>
          <dt>Experience</dt>
          <dd>⭐ {me.xp}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{me.pro ? "Pro" : "Free"}</dd>
          {me.pro && (
            <dd>
              <ManageBillingButton />
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="home-section">
      <SectionHead
        eyebrow="How it works"
        title="Read it, write it, watch it run"
        lead="Every lesson is a small step, and each step builds on the last."
      />
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
            <h3>{s.title}</h3>
            <p className="muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Pricing() {
  const [yearly, setYearly] = useState(true);
  const plan = yearly ? PRICING.yearly : PRICING.monthly;
  const { start, checkout, needsAccount } = useUpgrade();

  return (
    <section id="pricing" className="home-section">
      <SectionHead
        eyebrow="Pricing"
        title="Start free. Go Pro when you're hooked."
        lead="The free lessons are free for good, no card needed."
      />
      <BillingToggle yearly={yearly} onChange={setYearly} />
      <div className="plans">
        <div className="plan">
          <h3>Free</h3>
          <p className="price">
            $0 <span className="muted">forever</span>
          </p>
          <ul>
            {PRICING.free.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <a href="#courses" className="button">
            Browse free lessons
          </a>
        </div>
        <div className="plan plan-pro">
          <h3>
            Pro <span className="badge">PRO</span>
          </h3>
          <p className="price">
            ${plan.price} <span className="muted">{plan.label}</span>
          </p>
          <ul>
            {PRICING.pro.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button
            type="button"
            className="primary"
            onClick={() => start(yearly ? "year" : "month")}
            disabled={checkout.isPending}
          >
            {checkout.isPending
              ? "Opening checkout…"
              : needsAccount
                ? "Create an account to upgrade"
                : "Upgrade to Pro"}
          </button>
          <UpgradeErrors checkout={checkout} />
        </div>
      </div>
    </section>
  );
}

function Roadmap() {
  return (
    <section className="home-section">
      <SectionHead eyebrow="Roadmap" title="What's coming next" />
      <ul className="roadmap">
        {ROADMAP.map((r) => (
          <li key={r.title}>
            <span className="roadmap-status">{r.status}</span>
            <h3>{r.title}</h3>
            <p className="muted">{r.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OpenSource() {
  return (
    <section className="home-section open-source">
      <div>
        <p className="eyebrow">Open source</p>
        <h2>Built in the open</h2>
        <p className="muted">
          The platform (editor, canvas runner, test harness and grader) is open source under the
          AGPL. Read how your code is run and graded, or contribute a fix.
        </p>
      </div>
      <a href={GITHUB_URL} className="button" target="_blank" rel="noreferrer">
        View on GitHub ↗
      </a>
    </section>
  );
}

function Faq() {
  return (
    <section className="home-section">
      <SectionHead eyebrow="FAQ" title="Questions" />
      <div className="faq">
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p className="muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
