import { describe, expect, it } from "vitest";
import type { LoadedCourse } from "./load";
import { asPreview, assertPreviewDatabase, isLocalDatabaseUrl, splitPreviewFlag } from "./preview";

const course = (slug: string, published: boolean) =>
  ({
    slug,
    title: slug,
    description: "d",
    position: 0,
    published,
    chapters: [],
    chaptersLoaded: [{ slug: "basics", lessonsLoaded: [] }],
  }) as unknown as LoadedCourse;

describe("splitPreviewFlag", () => {
  it("is off without the flag", () => {
    expect(splitPreviewFlag(["dev"])).toEqual({ preview: false, args: ["dev"] });
  });

  it("takes the flag off the end", () => {
    expect(splitPreviewFlag(["dev", "--preview"])).toEqual({ preview: true, args: ["dev"] });
  });

  it("takes the flag out of the middle and the front", () => {
    expect(splitPreviewFlag(["dev", "--preview", "../c"])).toEqual({
      preview: true,
      args: ["dev", "../c"],
    });
    expect(splitPreviewFlag(["--preview", "dev", "../c"])).toEqual({
      preview: true,
      args: ["dev", "../c"],
    });
  });
});

describe("asPreview", () => {
  it("publishes every course without changing the input", () => {
    const hidden = course("draft", false);
    const live = course("live", true);
    const out = asPreview([hidden, live]);

    expect(out.map((c) => c.published)).toEqual([true, true]);
    expect(out.map((c) => c.slug)).toEqual(["draft", "live"]);
    expect(out[0]?.chaptersLoaded).toBe(hidden.chaptersLoaded);
    expect(hidden.published).toBe(false);
    expect(live.published).toBe(true);
  });
});

describe("isLocalDatabaseUrl", () => {
  it.each([
    "postgres://fixedstep:fixedstep@localhost:5432/fixedstep",
    "postgres://fixedstep:fixedstep@postgres:5432/fixedstep",
    "postgres://u:p@127.0.0.1/x",
    "postgres://u:p@[::1]:5432/x",
    "postgres://u:p@LOCALHOST/x",
    "postgres://u@localhost/fixedstep_e2e",
    "postgres://u:p@x/db?host=/var/run/postgresql",
  ])("accepts %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    "postgres://u:p@10.0.0.5/x",
    "postgres://u:p@db.abc.eu-west-1.rds.amazonaws.com/x",
    "postgres://u:p@postgres.example.com/x",
    "postgres://u:p@localhost.evil.com/x",
    "postgres://u:p@localhost/db?host=10.1.2.3",
    "postgres:///db",
    "not a url",
    "postgres://u:p@a:5432,b:5432/db",
  ])("refuses %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });
});

describe("assertPreviewDatabase", () => {
  it("throws when DATABASE_URL is unset", () => {
    expect(() => assertPreviewDatabase(undefined)).toThrow(/DATABASE_URL host is unset/);
  });

  it("throws for a remote host and names only the host", () => {
    const url = "postgres://u:s3cret@db.example.com/x";
    let message = "";
    try {
      assertPreviewDatabase(url);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("db.example.com");
    expect(message).not.toContain("s3cret");
  });

  it("does not throw for the compose database", () => {
    expect(() =>
      assertPreviewDatabase("postgres://fixedstep:fixedstep@postgres:5432/fixedstep"),
    ).not.toThrow();
  });
});
