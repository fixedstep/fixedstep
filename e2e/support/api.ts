// Seeding through the public HTTP API, so every row comes from the real code paths (XP only
// from a graded submit). With `page.request`, cookies land in the page's browser context.
import { randomUUID } from "node:crypto";
import type { CourseOutline } from "@fixedstep/content-schema";
import { type APIRequestContext, expect } from "@playwright/test";
import { COURSE, PASSWORD, WEB_URL } from "./env";

// Better Auth checks the Origin header on state-changing requests.
const headers = { origin: WEB_URL };

export type TestUser = { name: string; email: string; password: string };

export function newUser(tag: string): TestUser {
  return {
    name: `E2E ${tag}`,
    email: `e2e-${tag}-${randomUUID()}@example.test`,
    password: PASSWORD,
  };
}

export async function signUp(
  request: APIRequestContext,
  user: TestUser = newUser("user"),
): Promise<TestUser> {
  const res = await request.post("/api/auth/sign-up/email", { headers, data: user });
  expect(res.ok(), await res.text()).toBe(true);
  return user;
}

export async function lessonId(request: APIRequestContext, slug: string): Promise<string> {
  const res = await request.get("/api/courses", { headers });
  expect(res.ok()).toBe(true);
  const courses = (await res.json()) as CourseOutline[];
  const lesson = courses
    .find((c) => c.slug === COURSE)
    ?.chapters.flatMap((ch) => ch.lessons)
    .find((l) => l.slug === slug);
  if (!lesson) throw new Error(`lesson ${COURSE}/${slug} not found`);
  return lesson.id;
}

/** Submits a reading lesson, which passes with an empty body. */
export async function completeLesson(request: APIRequestContext, id: string): Promise<void> {
  const res = await request.post(`/api/lessons/${id}/submit`, { headers, data: {} });
  expect(res.ok(), await res.text()).toBe(true);
  expect((await res.json()).completed).toBe(true);
}

export async function rateCourse(
  request: APIRequestContext,
  slug: string,
  stars: number,
): Promise<void> {
  const res = await request.put(`/api/courses/${slug}/rating`, { headers, data: { stars } });
  expect(res.ok(), await res.text()).toBe(true);
}
