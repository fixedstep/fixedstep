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

describe("splitPreviewFlag edge cases", () => {
  it("removes every occurrence and ignores near-misses", () => {
    expect(splitPreviewFlag(["--preview", "sync", "--preview", "--previews", "-preview"])).toEqual({
      preview: true,
      args: ["sync", "--previews", "-preview"],
    });
    expect(splitPreviewFlag([])).toEqual({ preview: false, args: [] });
  });
});

describe("asPreview", () => {
  it("handles an empty list", () => {
    expect(asPreview([])).toEqual([]);
  });

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
  ])("accepts %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    "postgres://u:p@10.0.0.5/x",
    "postgres://u:p@db.abc.eu-west-1.rds.amazonaws.com/x",
    "postgres://u:p@postgres.example.com/x",
    "postgres://u:p@localhost.evil.com/x",
    "postgres://u:p@localhost/db?host=10.1.2.3",
    // postgres.js dials the URL hostname and ignores ?host=, so a local ?host= can't vouch for it.
    "postgres://u:p@x/db?host=/var/run/postgresql",
    "postgres:///db",
    "not a url",
    "postgres://u:p@a:5432,b:5432/db",
  ])("refuses %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });
});

describe("isLocalDatabaseUrl edge cases", () => {
  it.each([
    "postgresql://u:p@localhost/x",
    "postgresql://u:p@LocalHost:5433/x",
    "postgres://u@[0:0:0:0:0:0:0:1]/x",
    "postgres://u@localhost/x?host=LOCALHOST",
    "postgres://u@localhost/x?host=%2Fvar%2Frun%2Fpostgresql",
    "postgres://u@localhost:5432/x?sslmode=disable",
  ])("accepts %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    "postgres://localhost@evil.com/db",
    // postgres.js splits userinfo at the first `@` and would dial evil.com.
    "postgres://u:p@evil.com,x@localhost/db",
    "postgres://u:p@evil.com@localhost/db",
    "postgres://u@evil.com/x?host=localhost",
    "postgres://localhost:pw@evil.com/db",
    "postgres://u@localhost./x",
    "postgres://u@loc%61lhost/x",
    "postgres://u@localhost%2Eevil.com/x",
    "postgres://u@localhost/x?host=",
    "postgres://u@localhost/x?host=evil.com",
    "postgres://u@localhost/x?host=localhost,evil.com",
    "postgres://u@localhost/x?host=a&host=b",
    "postgres://u@[::ffff:127.0.0.1]/x",
    "postgres://u@[::2]/x",
    "postgres://u@127.1/x",
    "postgres://u@2130706433/x",
    "postgres://u@0.0.0.0/x",
    "postgres://u@localhost:abc/x",
    "",
  ])("refuses %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });

  // Production bugs: a multi-host libpq list whose first entry is a socket dir, and hostaddr,
  // both let a non-local server be reached while the guard sees "local".
  it("refuses a ?host= list that starts with a socket path but names a remote host", () => {
    expect(isLocalDatabaseUrl("postgres://u@localhost/x?host=/tmp,evil.com")).toBe(false);
  });

  it("refuses ?hostaddr= pointing at a remote address", () => {
    expect(isLocalDatabaseUrl("postgres://u@localhost/x?hostaddr=10.0.0.5")).toBe(false);
  });
});

describe("assertPreviewDatabase", () => {
  it("throws for an empty string and an unparseable URL", () => {
    expect(() => assertPreviewDatabase("")).toThrow(/host is unset/);
    expect(() => assertPreviewDatabase("not a url")).toThrow(/host is unparseable/);
  });

  it("names the ?host= override and hides the password", () => {
    let message = "";
    try {
      assertPreviewDatabase("postgres://u:s3cret@localhost/x?host=evil.example");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("evil.example");
    expect(message).not.toContain("s3cret");
  });

  it("names the dialed URL host when a local ?host= is ignored", () => {
    expect(() => assertPreviewDatabase("postgres://u:s3cret@evil.com/x?host=localhost")).toThrow(
      /host is evil\.com \(\?host=localhost\)/,
    );
  });

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
