import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Better Auth core tables. Names/columns follow Better Auth's default schema; after
// upgrading better-auth or adding plugins, diff against `npx @better-auth/cli generate`.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** Better Auth anonymous plugin: a guest who hasn't created an account yet. */
  isAnonymous: boolean("is_anonymous").default(false),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Course content. Written only by the content sync (private repo CI); read by the API.
// Removed lessons are archived, not deleted, so progress and submissions survive.
// ---------------------------------------------------------------------------

export const lessonKind = pgEnum("lesson_kind", ["reading", "quiz", "code", "sim"]);
export const access = pgEnum("access", ["free", "paid"]);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  position: integer("position").notNull(),
  published: boolean("published").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("chapters_course_slug_uq").on(t.courseId, t.slug)],
);

export type StoredQuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation?: string;
};

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    kind: lessonKind("kind").notNull(),
    access: access("access").notNull(),
    xp: integer("xp").notNull(),
    position: integer("position").notNull(),
    bodyMd: text("body_md").notNull(),
    starterCode: text("starter_code"),
    visibleTests: text("visible_tests"),
    /** Server-only. Never select into a browser-facing response. */
    hiddenTests: text("hidden_tests"),
    /** Server-only. */
    solution: text("solution"),
    /** Server-only as stored (contains answers); strip via PublicQuizQuestion. */
    quiz: jsonb("quiz").$type<StoredQuizQuestion[]>(),
    /** Hash of all lesson files; stored on submissions to know what version was graded. */
    contentHash: text("content_hash").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("lessons_chapter_slug_uq").on(t.chapterId, t.slug)],
);

// ---------------------------------------------------------------------------
// Learner progress & gamification
// ---------------------------------------------------------------------------

export const submissionStatus = pgEnum("submission_status", ["passed", "failed", "error"]);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    code: text("code"),
    answers: jsonb("answers").$type<Record<string, number>>(),
    contentHash: text("content_hash").notNull(),
    status: submissionStatus("status").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("submissions_user_lesson_idx").on(t.userId, t.lessonId, t.createdAt)],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const courseRatings = pgTable(
  "course_ratings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.courseId] }),
    check("course_ratings_stars_check", sql`${t.stars} between 1 and 5`),
  ],
);

export const xpReason = pgEnum("xp_reason", ["lesson_complete", "streak_bonus", "achievement"]);

/**
 * Append-only XP ledger. Only written after server-side verification. The unique index
 * makes awards idempotent: completing the same lesson twice can't double-award.
 */
export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: xpReason("reason").notNull(),
    refId: text("ref_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("xp_events_idempotency_uq").on(t.userId, t.reason, t.refId),
    index("xp_events_user_created_idx").on(t.userId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Billing. Provider webhooks (Polar) are normalized into entitlements; the app only ever
// checks entitlements, never the provider, so swapping providers is contained.
// ---------------------------------------------------------------------------

export const entitlementStatus = pgEnum("entitlement_status", [
  "active",
  "canceled",
  "past_due",
  "revoked",
]);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** What it unlocks, e.g. "pro". */
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    /** Provider's subscription id. */
    externalId: text("external_id").notNull(),
    status: entitlementStatus("status").notNull(),
    /** Access continues until this time even after cancellation. */
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    /** Provider's last-modified time for the subscription; older webhooks are skipped. */
    providerModifiedAt: timestamp("provider_modified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("entitlements_provider_external_uq").on(t.provider, t.externalId),
    index("entitlements_user_idx").on(t.userId),
  ],
);

/** Raw webhook log, keyed by provider event id for idempotent processing. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const activeEntitlementSql = sql`(${entitlements.status} = 'active' or (${entitlements.status} in ('canceled', 'past_due') and ${entitlements.currentPeriodEnd} > now()))`;
