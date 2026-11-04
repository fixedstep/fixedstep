import { describe, expect, it } from "vitest";
import { LEGAL_FACTS } from "./facts";
import { fillLegal, PRIVACY, TERMS } from "./legal";
import privacyMd from "./privacy.md?raw";
import termsMd from "./terms.md?raw";

describe("fillLegal", () => {
  it("replaces each token and leaves other text alone", () => {
    expect(
      fillLegal("Mail {{a}} or {{b}}. Keep {braces} and {{ x }}.", { a: "one", b: "two" }),
    ).toBe("Mail one or two. Keep {braces} and {{ x }}.");
  });

  it("throws on a token with no fact", () => {
    expect(() => fillLegal("Hello {{nope}}", {})).toThrow("unknown legal fact: nope");
  });
});

describe("legal pages", () => {
  it.each([
    ["privacy", PRIVACY, "# Privacy policy"],
    ["terms", TERMS, "# Terms of Service"],
  ])("%s starts with its heading and carries the effective date", (_, page, heading) => {
    expect(page.startsWith(`${heading}\n`)).toBe(true);
    expect(page).toContain(`Effective ${LEGAL_FACTS.effectiveDate}`);
  });

  it("has every token filled in", () => {
    expect(PRIVACY).not.toContain("{{");
    expect(TERMS).not.toContain("{{");
  });

  it("keeps placeholders in facts.ts, not in the Markdown", () => {
    expect(privacyMd).not.toContain("TODO");
    expect(termsMd).not.toContain("TODO");
  });

  it("names every processor and the hosting provider in the privacy policy", () => {
    for (const name of ["Polar", "Postmark", "PostHog", "GitHub", "Cloudflare", LEGAL_FACTS.host]) {
      expect(PRIVACY).toContain(name);
    }
  });

  it("describes local storage and the session cookie in the privacy policy", () => {
    expect(PRIVACY).toContain("local storage");
    expect(PRIVACY).toContain("better-auth.session_token");
  });

  it("covers cancellation, the jurisdiction and Polar's refund terms in the terms", () => {
    expect(TERMS).toContain("cancel");
    expect(TERMS).toContain(LEGAL_FACTS.jurisdiction);
    expect(TERMS).toContain(LEGAL_FACTS.polarTermsUrl);
  });
});
