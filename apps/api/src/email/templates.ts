import type { EmailMessage } from "./provider";

type Template = Omit<EmailMessage, "to">;

export function verifyEmailMessage(url: string): Template {
  return linkMessage({
    subject: "Verify your Fixedstep email",
    intro: "Confirm your email address to finish setting up your Fixedstep account.",
    action: "Verify email",
    url,
    outro: "If you didn't create an account, you can ignore this email.",
  });
}

export function resetPasswordMessage(url: string): Template {
  return linkMessage({
    subject: "Reset your Fixedstep password",
    intro: "Someone asked to reset the password for your Fixedstep account.",
    action: "Choose a new password",
    url,
    outro: "The link expires in an hour. If you didn't ask for this, you can ignore this email.",
  });
}

function linkMessage(m: {
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): Template {
  const url = escapeHtml(m.url);
  return {
    subject: m.subject,
    text: `${m.intro}\n\n${m.action}: ${m.url}\n\n${m.outro}\n`,
    html: `<p>${escapeHtml(m.intro)}</p>
<p><a href="${url}">${escapeHtml(m.action)}</a></p>
<p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${url}</p>
<p style="color:#666;font-size:13px">${escapeHtml(m.outro)}</p>`,
  };
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
