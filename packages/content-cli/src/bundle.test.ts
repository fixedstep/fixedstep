import { describe, expect, it } from "vitest";
import { parseBundle, serializeBundle } from "./bundle";
import type { LoadedCourse } from "./load";

const course = (hints?: string[]) =>
  ({
    slug: "game",
    title: "Game",
    description: "d",
    position: 0,
    published: true,
    chapters: ["basics"],
    chaptersLoaded: [
      {
        slug: "basics",
        title: "Basics",
        lessons: ["code-me"],
        lessonsLoaded: [
          {
            slug: "code-me",
            title: "Code me",
            kind: "code",
            access: "free",
            xp: 10,
            path: "code-me",
            bodyMd: "body",
            starterCode: "s",
            visibleTests: "t",
            hiddenTests: null,
            solution: "sol",
            ...(hints && { hints }),
            contentHash: "h",
          },
        ],
      },
    ],
  }) as LoadedCourse;

const lessonOf = (b: ReturnType<typeof parseBundle>) =>
  b.courses[0]?.chaptersLoaded[0]?.lessonsLoaded[0];

describe("parseBundle hints", () => {
  it("defaults hints to [] for bundles from older platforms", () => {
    expect(lessonOf(parseBundle(serializeBundle([course()])))?.hints).toEqual([]);
  });

  it("rejects more than 4 hints", () => {
    expect(() => parseBundle(serializeBundle([course(["1", "2", "3", "4", "5"])]))).toThrow(
      /invalid bundle/,
    );
  });

  it("round-trips hints", () => {
    const hints = ["nudge", "closer", "nearly"];
    expect(lessonOf(parseBundle(serializeBundle([course(hints)])))?.hints).toEqual(hints);
  });
});
