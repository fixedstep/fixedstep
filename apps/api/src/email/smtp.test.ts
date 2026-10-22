import type { SendMailOptions } from "nodemailer";
import { expect, it } from "vitest";
import { createSmtpProvider, smtpTransportOptions } from "./smtp";

const message = { to: "a@b.c", subject: "Hello", text: "t", html: "<p>h</p>" };

function fakeTransport(fail?: Error) {
  const sent: SendMailOptions[] = [];
  return {
    sent,
    transport: {
      async sendMail(m: SendMailOptions) {
        if (fail) throw fail;
        sent.push(m);
      },
    },
  };
}

it("sets finite connection, greeting and socket timeouts and keeps the URL", () => {
  const opts = smtpTransportOptions("smtp://u:p@mail.test:587");
  expect(opts.url).toBe("smtp://u:p@mail.test:587");
  for (const t of [opts.connectionTimeout, opts.greetingTimeout, opts.socketTimeout]) {
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(30_000);
  }
});

it("sends from the configured sender, without Reply-To unless set", async () => {
  const { sent, transport } = fakeTransport();
  await createSmtpProvider({ url: "smtp://x", from: "F <f@x.test>", transport }).send(message);
  expect(sent).toEqual([{ from: "F <f@x.test>", ...message }]);
  expect(sent[0]).not.toHaveProperty("replyTo");
});

it("adds Reply-To when configured", async () => {
  const { sent, transport } = fakeTransport();
  const provider = createSmtpProvider({
    url: "smtp://x",
    from: "f@x.test",
    replyTo: "help@x.test",
    transport,
  });
  await provider.send(message);
  expect(sent[0]).toMatchObject({ from: "f@x.test", replyTo: "help@x.test", to: "a@b.c" });
});

it("omits Reply-To when it is an empty string", async () => {
  const { sent, transport } = fakeTransport();
  const provider = createSmtpProvider({
    url: "smtp://x",
    from: "f@x.test",
    replyTo: "",
    transport,
  });
  await provider.send(message);
  expect(sent[0]).not.toHaveProperty("replyTo");
});

it("rejects when the transport does", async () => {
  const { transport } = fakeTransport(new Error("535 auth failed"));
  const provider = createSmtpProvider({ url: "smtp://x", from: "f@x.test", transport });
  await expect(provider.send(message)).rejects.toThrow("535 auth failed");
});
