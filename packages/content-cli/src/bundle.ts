import { ChapterManifest, CourseManifest, LessonFrontmatter } from "@fixedstep/content-schema";
import { z } from "zod";
import type { LoadedCourse } from "./load";

export const BUNDLE_VERSION = 1;

export type ContentBundle = {
  version: typeof BUNDLE_VERSION;
  createdAt: string;
  courses: LoadedCourse[];
};

export function serializeBundle(courses: LoadedCourse[]): string {
  // Local paths are meaningless (and mildly revealing) outside the content repo.
  const stripped = courses.map((c) => ({
    ...c,
    chaptersLoaded: c.chaptersLoaded.map((ch) => ({
      ...ch,
      lessonsLoaded: ch.lessonsLoaded.map((l) => ({ ...l, path: l.slug })),
    })),
  }));
  const bundle: ContentBundle = {
    version: BUNDLE_VERSION,
    createdAt: new Date().toISOString(),
    courses: stripped,
  };
  return JSON.stringify(bundle);
}

const NullableText = z.string().nullable();
const BundleSchema = z.object({
  version: z.literal(BUNDLE_VERSION),
  createdAt: z.string(),
  courses: z.array(
    CourseManifest.extend({
      chaptersLoaded: z.array(
        ChapterManifest.extend({
          lessonsLoaded: z.array(
            LessonFrontmatter.and(
              z.object({
                path: z.string(),
                bodyMd: z.string(),
                starterCode: NullableText,
                visibleTests: NullableText,
                hiddenTests: NullableText,
                solution: NullableText,
                contentHash: z.string(),
              }),
            ),
          ),
        }),
      ),
    }),
  ),
});

export function parseBundle(json: string): ContentBundle {
  const data: unknown = JSON.parse(json);
  const version = (data as { version?: unknown } | null)?.version;
  if (version !== BUNDLE_VERSION) {
    throw new Error(`unsupported bundle version ${version}; deploy the matching platform first`);
  }
  const result = BundleSchema.safeParse(data);
  if (!result.success) throw new Error(`invalid bundle: ${z.prettifyError(result.error)}`);
  return result.data;
}
