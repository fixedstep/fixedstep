import { expect, it } from "vitest";
import { resetPasswordMessage, verifyEmailMessage } from "./templates";

const url = "https://fixedstep.test/api/auth/reset-password/tok?callbackURL=/a&b=<c>";

it("puts the link in both bodies, escaped in HTML", () => {
  const m = resetPasswordMessage(url);
  expect(m.text).toContain(url);
  expect(m.html).toContain(
    'href="https://fixedstep.test/api/auth/reset-password/tok?callbackURL=/a&amp;b=&lt;c&gt;"',
  );
  expect(m.html).not.toContain("<c>");
  expect(verifyEmailMessage(url).subject).toMatch(/verify/i);
});

const link = "https://fixedstep.test/verify?token=abc&next=/";

it("renders the verify email", () => {
  expect(verifyEmailMessage(link)).toMatchSnapshot();
});

it("renders the reset password email", () => {
  expect(resetPasswordMessage(link)).toMatchSnapshot();
});
