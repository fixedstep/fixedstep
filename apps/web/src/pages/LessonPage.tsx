import type { GradeResult, PublicLesson } from "@fixedstep/content-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CodeEditor } from "../components/CodeEditor";
import { Markdown } from "../components/Markdown";
import { Preview } from "../components/Preview";
import { TestResults } from "../components/TestResults";
import { ApiError, api } from "../lib/api";
import { runTestsInWorker } from "../lib/run-in-worker";

export function LessonPage() {
  const { lessonId } = useParams({ from: "/lessons/$lessonId" });
  const lesson = useQuery({ queryKey: ["lesson", lessonId], queryFn: () => api.lesson(lessonId) });

  if (lesson.isPending) return <p className="muted">Loading…</p>;
  if (lesson.isError) return <p className="error">Couldn't load this lesson.</p>;
  if ("locked" in lesson.data) return <Paywall title={lesson.data.title} />;
  return <Lesson key={lesson.data.id} lesson={lesson.data} />;
}

function Paywall({ title }: { title: string }) {
  const checkout = useMutation({
    mutationFn: api.checkout,
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const needsLogin = checkout.error instanceof ApiError && checkout.error.status === 401;
  return (
    <div className="paywall">
      <h1>🔒 {title}</h1>
      <p>This lesson is part of Fixedstep Pro.</p>
      <button
        type="button"
        className="primary"
        onClick={() => checkout.mutate()}
        disabled={checkout.isPending}
      >
        Upgrade to Pro
      </button>
      {needsLogin && (
        <p>
          <Link to="/login">Sign in</Link> first.
        </p>
      )}
    </div>
  );
}

function useSubmit(lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.submit>[1]) => api.submit(lessonId, body),
    onSuccess: (res) => {
      if (res.completed) {
        void qc.invalidateQueries({ queryKey: ["me"] });
        void qc.invalidateQueries({ queryKey: ["courses"] });
        void qc.invalidateQueries({ queryKey: ["lesson", lessonId] });
      }
    },
  });
}

function SubmitFeedback({ submit }: { submit: ReturnType<typeof useSubmit> }) {
  if (submit.error instanceof ApiError && submit.error.status === 401) {
    return (
      <p>
        <Link to="/login">Sign in</Link> to save your progress.
      </p>
    );
  }
  if (submit.isError) return <p className="error">Submission failed. Try again.</p>;
  if (!submit.data) return null;
  return (
    <>
      <TestResults title="Server check" result={submit.data.grade} />
      {submit.data.xpAwarded > 0 && <p className="xp-toast">+{submit.data.xpAwarded} XP</p>}
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
    <div className="actions">
      <button
        type="button"
        className="primary"
        onClick={() => submit.mutate({})}
        disabled={submit.isPending}
      >
        Mark complete
      </button>
      <SubmitFeedback submit={submit} />
    </div>
  );
}

function Quiz({ lesson }: { lesson: PublicLesson }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const submit = useSubmit(lesson.id);
  return (
    <form
      className="quiz"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate({ answers });
      }}
    >
      {lesson.quiz?.map((q) => (
        <fieldset key={q.id}>
          <legend>{q.prompt}</legend>
          {q.options.map((opt, i) => (
            <label key={opt}>
              <input
                type="radio"
                name={q.id}
                checked={answers[q.id] === i}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
              />{" "}
              {opt}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="submit" className="primary" disabled={submit.isPending}>
        Submit answers
      </button>
      <SubmitFeedback submit={submit} />
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
function saveDraft(id: string, code: string) {
  try {
    localStorage.setItem(draftKey(id), code);
  } catch {
    // storage unavailable (private mode); drafts are a convenience only
  }
}

function CodeWorkspace({ lesson }: { lesson: PublicLesson }) {
  const starter = lesson.starterCode ?? "";
  const [code, setCode] = useState(() => loadDraft(lesson.id) ?? starter);
  const [local, setLocal] = useState<GradeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const [showTests, setShowTests] = useState(false);
  const submit = useSubmit(lesson.id);

  const runTests = async () => {
    setRunning(true);
    setLocal(await runTestsInWorker({ code, visibleTests: lesson.visibleTests ?? "" }));
    setRunning(false);
  };

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
        <button type="button" onClick={runTests} disabled={running}>
          Run tests
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => submit.mutate({ code })}
          disabled={submit.isPending}
        >
          Submit{lesson.hasHiddenTests ? " (+ hidden tests)" : ""}
        </button>
        <button type="button" className="link-button" onClick={() => setCode(starter)}>
          Reset
        </button>
        <button type="button" className="link-button" onClick={() => setShowTests((s) => !s)}>
          {showTests ? "Hide" : "View"} tests
        </button>
      </div>
      {lesson.kind === "sim" && <Preview code={code} runId={runId} />}
      {showTests && <CodeEditor value={lesson.visibleTests ?? ""} readOnly />}
      {local && <TestResults title="Local tests" result={local} />}
      <SubmitFeedback submit={submit} />
    </div>
  );
}
