import type { GradeResult, PublicLesson, SubmitRequest } from "@fixedstep/content-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CodeEditor } from "../components/CodeEditor";
import { CompletionCard } from "../components/CompletionCard";
import { EditorThemePicker } from "../components/EditorThemePicker";
import { GuestNudge } from "../components/GuestNudge";
import { HintsPanel } from "../components/HintsPanel";
import { LessonShell } from "../components/LessonShell";
import { Markdown } from "../components/Markdown";
import { NotFound } from "../components/NotFound";
import { Preview } from "../components/Preview";
import { ResultsPanel } from "../components/ResultsPanel";
import { LessonSkeleton } from "../components/Skeleton";
import { BillingToggle, UpgradeErrors, useUpgrade } from "../components/Upgrade";
import { ApiError, api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { withUpgrade } from "../lib/redirect";
import { runTestsInWorker } from "../lib/run-in-worker";
import { submitErrorMessage } from "../lib/submit-error";
import { PRICING } from "./home/content";

export function LessonPage() {
  const { lessonId } = useParams({ from: "/lessons/$lessonId" });
  const lesson = useQuery({ queryKey: ["lesson", lessonId], queryFn: () => api.lesson(lessonId) });

  if (lesson.error instanceof ApiError && lesson.error.status === 404)
    return <NotFound what="lesson" />;
  return (
    <LessonShell lessonId={lessonId}>
      {lesson.isPending ? (
        <LessonSkeleton />
      ) : lesson.isError ? (
        <p className="error">Couldn't load this lesson.</p>
      ) : "locked" in lesson.data ? (
        <Paywall title={lesson.data.title} />
      ) : (
        <Lesson key={lesson.data.id} lesson={lesson.data} />
      )}
    </LessonShell>
  );
}

function Paywall({ title }: { title: string }) {
  const [yearly, setYearly] = useState(true);
  const plan = yearly ? PRICING.yearly : PRICING.monthly;
  const { start, checkout, needsAccount } = useUpgrade();
  const href = useLocation({ select: (l) => l.href });

  return (
    <div className="paywall">
      <p className="eyebrow">Pro lesson</p>
      <h1>🔒 {title}</h1>
      <p className="muted">Unlock this lesson and every other Pro lesson with Fixedstep Pro.</p>
      <BillingToggle yearly={yearly} onChange={setYearly} />
      <p className="price">
        ${plan.price} <span className="muted">{plan.label}</span>
      </p>
      <ul className="paywall-features">
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
      {needsAccount && (
        <p className="muted">
          Already have an account?{" "}
          <Link to="/login" search={{ redirect: withUpgrade(href, yearly ? "year" : "month") }}>
            Sign in
          </Link>
        </p>
      )}
      <UpgradeErrors checkout={checkout} />
    </div>
  );
}

function useSubmit(lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitRequest | Record<string, never>) => {
      // Signed-out visitors become guests on their first submit, so their work is graded and
      // saved like anyone's. If that fails (e.g. rate limited) they get the sign-in prompt.
      const me = await qc.fetchQuery({ queryKey: ["me"], queryFn: api.me });
      const becameGuest = !me.user;
      if (becameGuest) {
        const res = await authClient.signIn.anonymous();
        if (res.error) throw new ApiError(401, res.error);
      }
      // Captured before the submit so the completion card can show a streak bump.
      const prevStreak = me.streak;
      return { ...(await api.submit(lessonId, body)), prevStreak, becameGuest };
    },
    onSuccess: (res) => {
      if (res.completed || res.becameGuest) void qc.invalidateQueries({ queryKey: ["me"] });
      if (res.completed) {
        void qc.invalidateQueries({ queryKey: ["courses"] });
        void qc.invalidateQueries({ queryKey: ["lesson", lessonId] });
      }
    },
  });
}

/** Sign-in prompt, error, or the completion card. Grade details are rendered by the caller. */
function SubmitStatus({
  submit,
  lessonId,
}: {
  submit: ReturnType<typeof useSubmit>;
  lessonId: string;
}) {
  if (submit.error instanceof ApiError && submit.error.status === 401) {
    return (
      <p>
        <Link to="/login">Sign in</Link> to save your progress.
      </p>
    );
  }
  if (submit.isError) {
    return (
      <p className="error" role="status">
        {submitErrorMessage(submit.error)}
      </p>
    );
  }
  if (!submit.data?.completed) return null;
  return (
    <>
      <CompletionCard
        lessonId={lessonId}
        xpAwarded={submit.data.xpAwarded}
        streak={submit.data.streak}
        prevStreak={submit.data.prevStreak}
      />
      <GuestNudge />
    </>
  );
}

function Lesson({ lesson }: { lesson: PublicLesson }) {
  return (
    <article className={`lesson lesson-${lesson.kind}`}>
      <div className="lesson-body">
        <h1>
          {lesson.title} {lesson.completed && <span title="Completed">✅</span>}
        </h1>
        <Markdown source={lesson.bodyMd} />
        {lesson.kind === "reading" && <ReadingFooter lesson={lesson} />}
        {lesson.kind === "quiz" && <Quiz lesson={lesson} />}
      </div>
      {(lesson.kind === "code" || lesson.kind === "sim") && <CodeWorkspace lesson={lesson} />}
    </article>
  );
}

function ReadingFooter({ lesson }: { lesson: PublicLesson }) {
  const submit = useSubmit(lesson.id);
  return (
    <div className="lesson-footer">
      {!submit.data?.completed && (
        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={() => submit.mutate({})}
            disabled={submit.isPending}
          >
            {submit.isPending ? "Saving…" : "Mark complete"}
          </button>
        </div>
      )}
      <SubmitStatus submit={submit} lessonId={lesson.id} />
    </div>
  );
}

function Quiz({ lesson }: { lesson: PublicLesson }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const submit = useSubmit(lesson.id);
  const questions = lesson.quiz ?? [];
  const passed = Boolean(submit.data?.completed);
  const submitted =
    submit.variables && "answers" in submit.variables ? submit.variables.answers : {};
  const unanswered = questions.filter((q) => answers[q.id] === undefined).length;

  return (
    <form
      className="quiz"
      onSubmit={(e) => {
        e.preventDefault();
        if (unanswered === 0) submit.mutate({ answers });
      }}
    >
      {questions.map((q) => {
        // Feedback only applies while the pick is unchanged since the last submit.
        const fb =
          answers[q.id] === submitted[q.id]
            ? submit.data?.quiz?.find((f) => f.id === q.id)
            : undefined;
        return (
          <fieldset
            key={q.id}
            className={fb ? (fb.correct ? "correct" : "incorrect") : undefined}
            disabled={passed}
          >
            <legend>{q.prompt}</legend>
            {q.options.map((opt, i) => {
              const picked = answers[q.id] === i;
              return (
                <label key={opt} className={picked && fb ? "picked" : undefined}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={picked}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                  />{" "}
                  {opt}
                  {picked && fb && (
                    <span className={`mark ${fb.correct ? "ok" : "bad"}`}>
                      <span aria-hidden>{fb.correct ? " ✓" : " ✗"}</span>
                      <span className="sr-only">{fb.correct ? "correct" : "incorrect"}</span>
                    </span>
                  )}
                </label>
              );
            })}
            {fb && (
              <p className="quiz-feedback">
                {fb.correct ? (fb.explanation ?? "Correct.") : "Not quite. Try another option."}
              </p>
            )}
          </fieldset>
        );
      })}
      {!passed && (
        <div className="actions">
          <button type="submit" className="primary" disabled={submit.isPending || unanswered > 0}>
            {submit.isPending ? "Checking…" : "Submit answers"}
          </button>
          {unanswered > 0 && (
            <span className="muted">
              {unanswered} question{unanswered === 1 ? "" : "s"} left
            </span>
          )}
        </div>
      )}
      <SubmitStatus submit={submit} lessonId={lesson.id} />
    </form>
  );
}

const draftKey = (id: string) => `fixedstep:draft:${id}`;
function loadDraft(id: string): string | null {
  try {
    return localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}
// Storage can be unavailable (private mode); drafts are a convenience only.
function saveDraft(id: string, code: string) {
  try {
    localStorage.setItem(draftKey(id), code);
  } catch {}
}
function clearDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {}
}

const MOD_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

function CodeWorkspace({ lesson }: { lesson: PublicLesson }) {
  const starter = lesson.starterCode ?? "";
  const [code, setCode] = useState(() => loadDraft(lesson.id) ?? starter);
  const [local, setLocal] = useState<{ result: GradeResult; code: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const [showTests, setShowTests] = useState(false);
  const submit = useSubmit(lesson.id);
  const submittedCode =
    submit.variables && "code" in submit.variables ? submit.variables.code : null;

  const runTests = async () => {
    if (running) return;
    setRunning(true);
    const ran = code;
    try {
      setLocal({
        result: await runTestsInWorker({ code: ran, visibleTests: lesson.visibleTests ?? "" }),
        code: ran,
      });
    } finally {
      setRunning(false);
    }
  };
  const submitCode = () => {
    if (!submit.isPending) submit.mutate({ code });
  };
  const reset = () => {
    if (code !== starter && !window.confirm("Discard your changes and restore the starter code?"))
      return;
    setCode(starter);
    clearDraft(lesson.id);
    setLocal(null);
    submit.reset();
  };

  // Capture phase so these win over the editor's own Mod-Enter binding.
  const shortcuts = useRef({ runTests, submitCode });
  shortcuts.current = { runTests, submitCode };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) shortcuts.current.submitCode();
      else void shortcuts.current.runTests();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="workspace">
      <CodeEditor
        value={code}
        onChange={(v) => {
          setCode(v);
          saveDraft(lesson.id, v);
        }}
      />
      <div className="actions">
        {lesson.kind === "sim" && (
          <button type="button" onClick={() => setRunId((n) => n + 1)}>
            ▶ Run
          </button>
        )}
        <button
          type="button"
          onClick={runTests}
          disabled={running}
          title={`Run the visible tests (${MOD_KEY}+Enter)`}
        >
          {running ? "Running…" : "Run tests"} <kbd>{MOD_KEY}↵</kbd>
        </button>
        <button
          type="button"
          className="primary"
          onClick={submitCode}
          disabled={submit.isPending}
          title={`Submit for grading (${MOD_KEY}+Shift+Enter)`}
        >
          {submit.isPending
            ? "Submitting…"
            : `Submit${lesson.hasHiddenTests ? " (+ hidden tests)" : ""}`}{" "}
          <kbd>{MOD_KEY}⇧↵</kbd>
        </button>
        <button type="button" className="link-button" onClick={reset}>
          Reset
        </button>
        <EditorThemePicker />
      </div>
      {lesson.kind === "sim" && <Preview code={code} runId={runId} />}
      <ResultsPanel
        local={local && { result: local.result, stale: local.code !== code }}
        server={
          submit.data && submittedCode !== null
            ? { result: submit.data.grade, stale: submittedCode !== code }
            : null
        }
      />
      <SubmitStatus submit={submit} lessonId={lesson.id} />
      <HintsPanel lessonId={lesson.id} status={submit.data?.hintStatus ?? lesson.hintStatus} />
      <details
        className="visible-tests"
        open={showTests}
        onToggle={(e) => setShowTests(e.currentTarget.open)}
      >
        <summary>Visible tests</summary>
        {showTests && <CodeEditor value={lesson.visibleTests ?? ""} readOnly />}
      </details>
    </div>
  );
}
