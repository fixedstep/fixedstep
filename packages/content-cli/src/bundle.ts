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

export function parseBundle(json: string): ContentBundle {
  const bundle = JSON.parse(json) as ContentBundle;
  if (bundle.version !== BUNDLE_VERSION) {
    throw new Error(`unsupported bundle version ${bundle.version}; deploy the matching platform first`);
  }
  return bundle;
}
