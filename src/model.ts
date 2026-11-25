// Pure decisions about proposals: status, follow-ups, the frozen copy and its fingerprint,
// signatures, and reading form values. No database and no requests: routes load rows, call
// these, then render or store what comes back. Pricing lives in pricing.ts.
import { createHash, createHmac } from "node:crypto";
import { quote, type Quote, type Section, type Selections, type TaxMode, type Terms } from "./pricing.js";

export type Status = "draft" | "sent" | "accepted" | "declined";
export type Shown = Status | "viewed" | "expired";

export type Proposal = Terms & {
  id: number;
  token: string;
  title: string;
  subtitle: string;
  client_name: string;
  client_company: string;
  client_email: string;
  cover_upload_id: string | null;
  expires_on: string | null;
  status: Status;
  is_template: boolean;
  owner_email: string;
  owner_name: string;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
  first_viewed_at: Date | null;
  last_viewed_at: Date | null;
  view_count: number;
  followed_up_at: Date | null;
  decided_at: Date | null;
  decline_reason: string;
  value_cents: number;
};

export type Brand = { business_name: string; accent: string; logo_upload_id: string | null };

// Everything the proposal page draws. A live proposal builds it from rows; an accepted one is
// read back from its frozen copy, so later edits to the business or the proposal never change
// what was signed.
export type ProposalDoc = {
  brand: Brand;
  proposal: Pick<Proposal, "id" | "title" | "subtitle" | "client_name" | "client_company" | "cover_upload_id" | "expires_on" | "currency" | "tax_mode" | "gst_rate_bp" | "discount_bp" | "deposit_bp" | "owner_name" | "owner_email">;
  sections: Section[];
};

export type Signature = { kind: "typed"; text: string } | { kind: "drawn"; path: string };

export type Acceptance = {
  name: string;
  email: string;
  signature: Signature;
  ip: string;
  user_agent: string;
  accepted_at: string;
};

export type Frozen = { doc: ProposalDoc; selections: Selections; quote: Quote; acceptance: Acceptance };

// ----- Dates, in the business's time zone -----

export const TZ = "America/New_York";

// The calendar day in the business's time zone, as YYYY-MM-DD.
export const dayIn = (d: Date, tz = TZ) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export const prettyDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const prettyTime = (d: Date | string, tz = TZ) =>
  new Date(d).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).replace(",", "");

// "3 hours ago", "yesterday", "Oct 12".
export const ago = (d: Date | string, now: Date) => {
  const s = Math.max(0, Math.round((now.getTime() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: TZ });
};

// ----- Status -----

type StatusFields = Pick<Proposal, "status" | "expires_on" | "first_viewed_at">;

export const isExpired = (p: Pick<Proposal, "status" | "expires_on">, now: Date) =>
  p.status === "sent" && p.expires_on !== null && p.expires_on < dayIn(now);

export const shownStatus = (p: StatusFields, now: Date): Shown => {
  if (p.status !== "sent") return p.status;
  if (isExpired(p, now)) return "expired";
  return p.first_viewed_at ? "viewed" : "sent";
};

export const statusLabel: Record<Shown, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

// The client may act on a proposal that has been sent, is not expired and is not decided.
export const isOpenToClient = (p: Pick<Proposal, "status" | "expires_on" | "is_template">, now: Date) => !p.is_template && p.status === "sent" && !isExpired(p, now);

// Editing stops once the client has decided; the frozen copy is what they agreed to.
export const isLocked = (p: Pick<Proposal, "status">) => p.status === "accepted" || p.status === "declined";

// ----- Follow-ups -----

export type FollowUp = "not_opened" | "not_accepted" | "expiring" | null;

export const followUpLabel: Record<Exclude<FollowUp, null>, string> = {
  not_opened: "Not opened",
  not_accepted: "Opened, not accepted",
  expiring: "Expires soon",
};

// followUp says why a sent proposal needs a nudge: unopened a day after sending, opened but
// undecided three days later, or expiring within three days. A follow-up in the last three days
// quiets it.
export const followUp = (p: Pick<Proposal, "status" | "expires_on" | "sent_at" | "first_viewed_at" | "followed_up_at" | "is_template">, now: Date): FollowUp => {
  if (p.is_template || p.status !== "sent" || !p.sent_at || isExpired(p, now)) return null;
  const hours = (d: Date) => (now.getTime() - new Date(d).getTime()) / 3600000;
  if (p.followed_up_at && hours(p.followed_up_at) < 72) return null;
  if (p.expires_on && p.expires_on <= addDays(dayIn(now), 3)) return "expiring";
  if (!p.first_viewed_at) return hours(p.sent_at) >= 24 ? "not_opened" : null;
  return hours(p.sent_at) >= 72 ? "not_accepted" : null;
};

// ----- The frozen copy -----

// canonical is JSON with keys sorted at every level, so the same content always gives the
// same bytes and so the same fingerprint.
export const canonical = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
};

export const fingerprint = (f: Frozen) => createHash("sha256").update(canonical(f)).digest("hex");

export const freeze = (doc: ProposalDoc, selections: Selections, acceptance: Acceptance): Frozen => ({
  doc,
  selections,
  quote: quote(doc.sections, selections, doc.proposal),
  acceptance,
});

// ----- Signatures -----

// A drawn signature arrives as strokes of [x, y] points on a 1000 by 300 pad. It is kept as an
// SVG path built here from numbers only, so nothing a browser sends can become markup.
export const PAD = { w: 1000, h: 300 };
const MAX_POINTS = 4000;

export const strokesToPath = (raw: unknown): string | null => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return null;
  const strokes = raw.map((s) =>
    Array.isArray(s)
      ? s.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n))).map(([x, y]) => [Math.round(Math.min(PAD.w, Math.max(0, x))), Math.round(Math.min(PAD.h, Math.max(0, y)))] as const)
      : [],
  ).filter((s) => s.length > 0);
  const points = strokes.reduce((n, s) => n + s.length, 0);
  if (points < 6 || points > MAX_POINTS) return null;
  return strokes.map((s) => (s.length === 1 ? `M${s[0][0]} ${s[0][1]}h1` : `M${s[0][0]} ${s[0][1]}` + s.slice(1).map(([x, y]) => `L${x} ${y}`).join(""))).join("");
};

export const isPath = (s: string) => /^(?:[MLh]-?\d+(?: -?\d+)?)+$/.test(s) && s.length < 60000;

export const isEmail = (s: string) => s.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s);

export type AcceptForm = { name: string; email: string; signature: Signature };

// acceptProblems lists what is wrong with an acceptance, in words for the client.
export const acceptProblems = (f: Partial<AcceptForm>): string[] =>
  [
    !f.name?.trim() ? "Type your full name." : "",
    !f.email || !isEmail(f.email) ? "Enter your email address." : "",
    !f.signature ? "Sign in the box." : f.signature.kind === "typed" ? (f.signature.text.trim().length < 2 ? "Type your name to sign." : "") : !isPath(f.signature.path) ? "Sign in the box." : "",
  ].filter(Boolean);

// ----- Reading form values -----

export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// cents reads "1,250.50", "$1250" or "1250" as 125050 cents; anything else is null.
export const cents = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[\s,$]/g, "").replace(/^USD/i, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return Math.abs(n) <= 100_000_000_000 ? n : null;
};

export const centsText = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

// percentBp reads "15", "15%" or "12.5" as basis points, between 0 and 100%.
export const percentBp = (v: unknown, fallback: number) => {
  const n = Number(typeof v === "string" ? v.replace("%", "").trim() : v);
  return v === "" || v === undefined || !Number.isFinite(n) ? fallback : Math.round(Math.min(100, Math.max(0, n)) * 100);
};

export const bpText = (bp: number) => String(bp / 100);

export const intIn = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

export const taxModes: readonly TaxMode[] = ["exclusive", "inclusive", "none"];
export const asTaxMode = (v: unknown, fallback: TaxMode): TaxMode => (taxModes.includes(v as TaxMode) ? (v as TaxMode) : fallback);

export const isCurrency = (s: string) => /^[A-Z]{3}$/.test(s);
export const isColour = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

// A webhook URL must be https to a public host name (not an address, not localhost).
export const isPublicUrl = (s: string) => {
  try {
    const u = new URL(s);
    const h = u.hostname;
    return u.protocol === "https:" && h.includes(".") && !/^[\d.]+$/.test(h) && !h.includes(":") && !/(^|\.)(localhost|local|internal|whisk)$/i.test(h);
  } catch {
    return false;
  }
};

// ----- Webhooks and export -----

export type WebhookEvent = "proposal.sent" | "proposal.viewed" | "proposal.accepted" | "proposal.declined";
export const webhookEvents: readonly WebhookEvent[] = ["proposal.sent", "proposal.viewed", "proposal.accepted", "proposal.declined"];

// "t=<unix time>,v1=<hex HMAC-SHA256 of '<t>.<body>'>", the same shape as Stripe's.
export const webhookSignature = (secret: string, t: number, body: string) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

const cell = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// csv writes rows with a header; cells that a spreadsheet would run as a formula are quoted.
export const csv = (header: readonly string[], rows: readonly (readonly unknown[])[]) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

// The slug of a template or a file name: "Website refresh" becomes "website-refresh".
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "proposal";
