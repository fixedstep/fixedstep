import { afterEach, expect, it, vi } from "vitest";
import {
  type EmailMessage,
  type EmailProvider,
  sendInBackground,
  withSubjectPrefix,
} from "./provider";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lets the provider's settled promise run its log handler. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function recorder() {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    name: "fake",
    async send(m) {
      sent.push(m);
    },
  };
  return { provider, sent };
}

const message = { to: "a@b.c", subject: "Hello", text: "t", html: "<p>h</p>" };

it("prefixes the subject and leaves the rest of the message alone", async () => {
  const { provider, sent } = recorder();
  const prefixed = withSubjectPrefix(provider, "[staging]");
  expect(prefixed.name).toBe("fake");
  await prefixed.send(message);
  expect(sent).toEqual([{ ...message, subject: "[staging] Hello" }]);
});

it("returns the same provider without a prefix", () => {
  const { provider } = recorder();
  expect(withSubjectPrefix(provider)).toBe(provider);
  expect(withSubjectPrefix(provider, "")).toBe(provider);
  expect(withSubjectPrefix(provider, "   ")).toBe(provider);
});

it("trims the prefix", async () => {
  const { provider, sent } = recorder();
  await withSubjectPrefix(provider, " [staging] ").send(message);
  expect(sent[0]?.subject).toBe("[staging] Hello");
});

const { to, ...withoutTo } = message;

it("sends in the background and logs the subject, not the address, once sent", async () => {
  const { provider, sent } = recorder();
  const printed = vi.spyOn(console, "log").mockImplementation(() => {});
  const failed = vi.spyOn(console, "error").mockImplementation(() => {});
  sendInBackground(provider, to, withoutTo);
  await flush();
  expect(sent).toEqual([message]);
  expect(printed).toHaveBeenCalledWith('[email] fake sent "Hello"');
  expect(printed.mock.calls.flat().join(" ")).not.toContain(to);
  expect(failed).not.toHaveBeenCalled();
});

it("logs the failure when the provider rejects", async () => {
  const error = new Error("down");
  const provider: EmailProvider = { name: "fake", send: () => Promise.reject(error) };
  const printed = vi.spyOn(console, "log").mockImplementation(() => {});
  const failed = vi.spyOn(console, "error").mockImplementation(() => {});
  sendInBackground(provider, to, withoutTo);
  await flush();
  expect(failed).toHaveBeenCalledWith('[email] fake failed to send "Hello"', error);
  expect(printed).not.toHaveBeenCalled();
});

it("returns before the send resolves", async () => {
  let accept = () => {};
  const provider: EmailProvider = {
    name: "fake",
    send: () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  };
  const printed = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(sendInBackground(provider, to, withoutTo)).toBeUndefined();
  await flush();
  expect(printed).not.toHaveBeenCalled();
  accept();
  await flush();
  expect(printed).toHaveBeenCalledWith('[email] fake sent "Hello"');
});
