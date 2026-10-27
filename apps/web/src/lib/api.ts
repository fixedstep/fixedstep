import type {
  CourseOutline,
  CourseRating,
  LessonHints,
  LockedLesson,
  PublicLesson,
  RateCourseRequest,
  SubmitRequest,
  SubmitResponse,
} from "@fixedstep/content-schema";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export type Me = {
  /** `isAnonymous`: a guest, created on first submit, who hasn't made an account yet. */
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    isAnonymous: boolean;
  } | null;
  xp: number;
  streak: number;
  pro: boolean;
};

export const api = {
  me: () => request<Me>("/me"),
  courses: () => request<CourseOutline[]>("/courses"),
  /** Resolves to a LockedLesson (instead of throwing) when the 402 paywall applies. */
  lesson: async (id: string): Promise<PublicLesson | LockedLesson> => {
    try {
      return await request<PublicLesson>(`/lessons/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) return e.body as LockedLesson;
      throw e;
    }
  },
  /** Only the hints the caller has unlocked. */
  hints: (id: string) => request<LessonHints>(`/lessons/${id}/hints`),
  submit: (id: string, body: SubmitRequest | Record<string, never>) =>
    request<SubmitResponse>(`/lessons/${id}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  checkout: (interval: "month" | "year" = "month") =>
    request<{ url: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ interval }),
    }),
  rateCourse: (slug: string, stars: number) =>
    request<CourseRating>(`/courses/${slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ stars } satisfies RateCourseRequest),
    }),
  portal: () => request<{ url: string }>("/billing/portal", { method: "POST" }),
};
