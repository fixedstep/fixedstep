import { LEGAL_FACTS } from "./facts";
import privacyMd from "./privacy.md?raw";
import termsMd from "./terms.md?raw";

/** Replaces each `{{key}}` with its fact. An unknown key is a bug in the source, so it throws. */
export function fillLegal(source: string, facts: Record<string, string>): string {
  return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = facts[key];
    if (value === undefined) throw new Error(`unknown legal fact: ${key}`);
    return value;
  });
}

export const PRIVACY = fillLegal(privacyMd, LEGAL_FACTS);
export const TERMS = fillLegal(termsMd, LEGAL_FACTS);
