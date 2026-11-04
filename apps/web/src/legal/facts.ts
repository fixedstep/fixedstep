import { GITHUB_URL } from "../pages/home/content";

/**
 * Facts the legal pages need. Every TODO(user) in them comes from here: fill it in and the pages
 * update. The operator, jurisdiction, minimum age and Polar's refund-terms link are still open.
 */
export const LEGAL_FACTS = {
  operator: "TODO(user): legal name of the person or company operating Fixedstep",
  contactEmail: "admin@fixedstep.com",
  jurisdiction: "TODO(user): governing-law jurisdiction",
  minimumAge: "13",
  polarTermsUrl: "TODO(user): link to Polar's buyer/refund terms",
  host: "Amazon Web Services (AWS), region us-east-2 (Ohio, USA)", // gcp would be us-east1
  repoUrl: GITHUB_URL,
  effectiveDate: "2026-11-03",
} as const;
