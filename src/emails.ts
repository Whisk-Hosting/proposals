// Every email the app sends, as plain functions from data to { subject, html, text }. Text in
// the HTML is escaped; each email has a plain-text twin.
import { escape } from "./markdown.js";
import type { Proposal } from "./model.js";
import { accentOf, onAccent } from "./views/layout.js";
import type { Settings } from "./store.js";

export type Mail = { to: string; subject: string; html: string; text: string; reply_to?: string };

const frame = (s: Settings, parts: { heading: string; paras: string[]; button?: { href: string; label: string }; quote?: string }) => {
  const accent = accentOf(s);
  const p = (t: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3b3833">${escape(t)}</p>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f2ee;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${accent};height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:32px 36px 8px"><div style="font-weight:700;font-size:15px;color:#6b665d">${escape(s.business_name)}</div>
<h1 style="margin:14px 0 18px;font-size:24px;line-height:1.25;color:#1f1d1a">${escape(parts.heading)}</h1>
${parts.paras.map(p).join("")}
${parts.quote ? `<div style="margin:0 0 18px;padding:14px 18px;background:#f7f5f0;border-radius:10px;font-size:15px;line-height:1.55;color:#3b3833;white-space:pre-wrap">${escape(parts.quote)}</div>` : ""}
${parts.button ? `<p style="margin:24px 0 30px"><a href="${escape(parts.button.href)}" style="display:inline-block;background:${accent};color:${onAccent(accent)};text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:12px">${escape(parts.button.label)}</a></p>` : ""}
</td></tr></table>
<p style="font-size:12px;color:#9a948a;margin:18px 0 0">${escape(s.business_name)}</p>
</td></tr></table></body></html>`;
};

const plain = (parts: { heading: string; paras: string[]; button?: { href: string; label: string }; quote?: string }) =>
  [parts.heading, "", ...parts.paras, parts.quote ? `\n> ${parts.quote.replace(/\n/g, "\n> ")}\n` : "", parts.button ? `${parts.button.label}: ${parts.button.href}` : ""].filter((x) => x !== undefined).join("\n");

const make = (s: Settings, to: string, subject: string, parts: Parameters<typeof frame>[1], reply_to?: string): Mail => ({ to, subject, html: frame(s, parts), text: plain(parts), reply_to });

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const hello = (name: string) => (firstName(name) ? `Hi ${firstName(name)},` : "Hi,");

// ----- To the client -----

export const proposalEmail = (s: Settings, p: Proposal, link: string, note: string, replyTo: string) =>
  make(s, p.client_email, `Proposal: ${p.title}`, {
    heading: p.title,
    paras: [hello(p.client_name), note || `Here's our proposal. You can choose options, ask questions and accept it online.`],
    button: { href: link, label: "Open the proposal" },
  }, replyTo);

export const followUpEmail = (s: Settings, p: Proposal, link: string, note: string, replyTo: string) =>
  make(s, p.client_email, `Following up: ${p.title}`, {
    heading: p.title,
    paras: [hello(p.client_name), note || `Just checking in on the proposal we sent. Happy to answer any questions.`],
    button: { href: link, label: "Open the proposal" },
  }, replyTo);

export const answerEmail = (s: Settings, p: Proposal, to: string, link: string, q: { body: string; answer: string; by: string }) =>
  make(s, to, `Re: your question on ${p.title}`, {
    heading: "Your question, answered",
    paras: [`${q.by} answered your question on "${p.title}":`],
    quote: `${q.body}\n\n${q.answer}`,
    button: { href: `${link}#questions`, label: "See it on the proposal" },
  });

export const acceptedReceipt = (s: Settings, p: Proposal, to: string, name: string, link: string) =>
  make(s, to, `Accepted: ${p.title}`, {
    heading: "Thanks, it's accepted",
    paras: [hello(name), `You accepted "${p.title}". Download a PDF copy below. We'll be in touch shortly.`],
    button: { href: `${link}/pdf`, label: "Download the PDF" },
  });

// ----- To the business -----

export type Alert = { kind: "viewed" | "question" | "accepted" | "declined"; who: string; detail: string };

const alertHeading: Record<Alert["kind"], (who: string) => string> = {
  viewed: (who) => `${who} opened your proposal`,
  question: (who) => `${who} asked a question`,
  accepted: (who) => `${who} accepted 🎉`,
  declined: (who) => `${who} declined`,
};

export const alertEmail = (s: Settings, p: Proposal, to: string, a: Alert, editLink: string) =>
  make(s, to, `${alertHeading[a.kind](a.who)}: ${p.title}`, {
    heading: alertHeading[a.kind](a.who),
    paras: [p.title],
    quote: a.detail || undefined,
    button: { href: editLink, label: a.kind === "question" ? "Answer it" : "Open the proposal" },
  });

export const testEmail = (s: Settings, to: string) =>
  make(s, to, `Test email from ${s.business_name}`, { heading: "Email works", paras: ["Proposals, alerts and receipts will arrive like this."] });
