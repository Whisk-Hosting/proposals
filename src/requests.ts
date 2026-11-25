// The API's pure half: finding the key in a request, pages of lists, checking JSON bodies, and
// the JSON each resource comes back as. No database and no requests. A checked body is turned
// into the same form fields the editor sends, so editing.ts reads both the same way.
import type { Fields, NewKind } from "./editing.js";
import { bpText, centsText, isCurrency, isDay, isEmail, shownStatus, taxModes, type Frozen, type Proposal, type Shown } from "./model.js";
import type { Item, Line, Quote, Section, Totals } from "./pricing.js";

// ----- Keys -----

export const KEY_PREFIX = "prp_";

type Header = (name: string) => string | undefined;

// keyFrom finds the key in Authorization: Bearer <key>, Basic auth with the key as the user
// name, X-Api-Key, or ?token=, in that order.
export const keyFrom = (header: Header, token: string | undefined): string => {
  const auth = (header("authorization") ?? "").trim();
  const bearer = /^bearer\s+(.+)$/i.exec(auth)?.[1];
  if (bearer) return bearer.trim();
  const basic = /^basic\s+(.+)$/i.exec(auth)?.[1];
  if (basic) {
    const decoded = Buffer.from(basic.trim(), "base64").toString("utf8");
    return decoded.split(":")[0].trim();
  }
  return (header("x-api-key") ?? token ?? "").trim();
};

// looksLikeKey is checked before any lookup, so junk never reaches the database.
export const looksLikeKey = (k: string) => new RegExp(`^${KEY_PREFIX}[A-Za-z0-9_-]{32}$`).test(k);

// ----- Results -----

export type Problem = { code: string; message: string; fix: string };
export type Checked<T> = { ok: true; value: T } | { ok: false; problem: Problem };

const ok = <T>(value: T): Checked<T> => ({ ok: true, value });
const no = (code: string, message: string, fix: string): Checked<never> => ({ ok: false, problem: { code, message, fix } });

// ----- Pages -----

export type Page = { limit: number; offset: number };

// pageOf reads ?limit= (1 to 100, 25 when left out) and ?offset= (0 or more).
export const pageOf = (limit: string | undefined, offset: string | undefined): Checked<Page> => {
  const l = limit === undefined || limit === "" ? 25 : Number(limit);
  const o = offset === undefined || offset === "" ? 0 : Number(offset);
  if (!Number.isInteger(l) || l < 1 || l > 100) return no("LIMIT_INVALID", "limit must be a whole number from 1 to 100.", "Send ?limit=25, or leave it out.");
  if (!Number.isInteger(o) || o < 0) return no("OFFSET_INVALID", "offset must be a whole number, 0 or more.", "Send the next_offset from the last page, or leave it out.");
  return ok({ limit: l, offset: o });
};

// paginate cuts one page from a list; next_offset is null on the last page.
export const paginate = <T>(all: readonly T[], p: Page) => ({
  items: all.slice(p.offset, p.offset + p.limit),
  total: all.length,
  next_offset: p.offset + p.limit < all.length ? p.offset + p.limit : null,
});

export const shownStatuses: readonly Shown[] = ["draft", "sent", "viewed", "accepted", "declined", "expired"];

export const statusFilter = (v: string | undefined): Checked<Shown | undefined> =>
  !v ? ok(undefined) : (shownStatuses as readonly string[]).includes(v) ? ok(v as Shown) : no("STATUS_INVALID", `status must be one of ${shownStatuses.join(", ")}.`, "Send ?status=viewed, or leave it out.");

// ----- Bodies -----

export type Body = Readonly<Record<string, unknown>>;

export const asBody = (v: unknown): Body | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Body) : undefined);

const isStr = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const isPct = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
const isCents = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100_000_000_000;
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100_000;

// firstProblem runs checks in order and answers the first that fails.
const firstProblem = (checks: readonly [boolean, string][], code: string, fix: string): Checked<true> => {
  const failed = checks.find(([good]) => !good);
  return failed ? no(code, failed[1], fix) : ok(true);
};

// ----- Proposals -----

const proposalFix = 'Send {"title": "Website refresh", "client": {"name": "Ana Silva", "email": "ana@example.com"}, "expires_on": "2026-12-01"}.';

// proposalBody checks a proposal's fields, all optional, and turns them into the editor's form
// fields: client is {name, company, email}; tax_rate, discount and deposit are percentages.
export const proposalBody = (b: Body): Checked<Fields> => {
  const client = b.client === undefined ? {} : asBody(b.client);
  const checked = firstProblem(
    [
      [b.title === undefined || (isStr(b.title, 160) && (b.title as string).trim() !== ""), "title must be text of 1 to 160 characters."],
      [b.subtitle === undefined || isStr(b.subtitle, 240), "subtitle must be text of up to 240 characters."],
      [client !== undefined, "client must be an object: {name, company, email}."],
      [client?.name === undefined || isStr(client.name, 120), "client.name must be text of up to 120 characters."],
      [client?.company === undefined || isStr(client.company, 120), "client.company must be text of up to 120 characters."],
      [client?.email === undefined || client.email === "" || (typeof client.email === "string" && isEmail(client.email.trim())), "client.email is not an email address."],
      [b.currency === undefined || (typeof b.currency === "string" && isCurrency(b.currency.toUpperCase())), "currency must be a three-letter code, like USD."],
      [b.tax_mode === undefined || taxModes.includes(b.tax_mode as never), `tax_mode must be one of ${taxModes.join(", ")}.`],
      [b.tax_rate === undefined || isPct(b.tax_rate), "tax_rate must be a percentage from 0 to 100."],
      [b.discount === undefined || isPct(b.discount), "discount must be a percentage from 0 to 100."],
      [b.deposit === undefined || isPct(b.deposit), "deposit must be a percentage from 0 to 100."],
      [b.expires_on === undefined || b.expires_on === null || (typeof b.expires_on === "string" && isDay(b.expires_on)), "expires_on must be a date, YYYY-MM-DD, or null."],
    ],
    "PROPOSAL_INVALID",
    proposalFix,
  );
  if (!checked.ok) return checked;
  const pairs: [string, unknown][] = [
    ["title", b.title],
    ["subtitle", b.subtitle],
    ["client_name", client?.name],
    ["client_company", client?.company],
    ["client_email", client?.email],
    ["currency", b.currency],
    ["tax_mode", b.tax_mode],
    ["gst", b.tax_rate],
    ["discount", b.discount],
    ["deposit", b.deposit],
    ["expires_on", b.expires_on === null ? "" : b.expires_on],
  ];
  return ok(Object.fromEntries(pairs.filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])));
};

// ----- Sections and items -----

export const sectionKinds: readonly NewKind[] = ["text", "pricing", "packages", "image"];

export type ItemBody = {
  id?: number;
  name: string;
  description?: string;
  unit_price_cents: number;
  quantity?: number;
  unit?: string;
  mode?: "fixed" | "optional";
  selected?: boolean;
  recommended?: boolean;
  client_quantity?: { min: number; max: number } | null;
  recurring?: "once" | "month";
};

const itemFix = 'Send items as [{"name": "Design", "unit_price_cents": 250000, "quantity": 1}].';

const itemProblem = (raw: unknown, n: number): string => {
  const i = asBody(raw);
  const at = `items[${n}]`;
  if (!i) return `${at} must be an object.`;
  const cq = i.client_quantity === undefined || i.client_quantity === null ? null : asBody(i.client_quantity);
  const checks: [boolean, string][] = [
    [i.id === undefined || (Number.isInteger(i.id) && (i.id as number) > 0), `${at}.id must be the id of one of this section's items, or left out for a new one.`],
    [isStr(i.name, 160) && (i.name as string).trim() !== "", `${at}.name must be text of 1 to 160 characters.`],
    [i.description === undefined || isStr(i.description, 600), `${at}.description must be text of up to 600 characters.`],
    [isCents(i.unit_price_cents), `${at}.unit_price_cents must be a whole number of cents, 0 or more.`],
    [i.quantity === undefined || isCount(i.quantity), `${at}.quantity must be a whole number, 0 or more.`],
    [i.unit === undefined || isStr(i.unit, 20), `${at}.unit must be text of up to 20 characters, like hour.`],
    [i.mode === undefined || i.mode === "fixed" || i.mode === "optional", `${at}.mode must be fixed or optional.`],
    [i.selected === undefined || typeof i.selected === "boolean", `${at}.selected must be true or false.`],
    [i.recommended === undefined || typeof i.recommended === "boolean", `${at}.recommended must be true or false.`],
    [i.client_quantity === undefined || i.client_quantity === null || (!!cq && isCount(cq.min) && isCount(cq.max) && (cq.min as number) <= (cq.max as number)), `${at}.client_quantity must be {min, max} with min no more than max, or null.`],
    [i.recurring === undefined || i.recurring === "once" || i.recurring === "month", `${at}.recurring must be once or month.`],
  ];
  return checks.find(([good]) => !good)?.[1] ?? "";
};

// itemsFields turns a checked item list into the editor's parallel row fields. In a pick-one
// section every item is a package and the recommended one starts chosen.
const itemsFields = (items: readonly ItemBody[], pickOne: boolean): Fields => {
  const col = (f: (i: ItemBody) => string) => items.map(f);
  return {
    id: col((i) => (i.id ? String(i.id) : "")),
    name: col((i) => i.name.trim()),
    description: col((i) => i.description ?? ""),
    price: col((i) => centsText(i.unit_price_cents)),
    qty: col((i) => String(i.quantity ?? 1)),
    unit: col((i) => i.unit ?? ""),
    kind: col((i) => (pickOne ? (i.recommended ? "recommended" : "package") : i.mode === "optional" ? (i.selected === false ? "off" : "on") : "fixed")),
    qtymode: col((i) => (i.client_quantity ? "client" : "fixed")),
    qmin: col((i) => String(i.client_quantity?.min ?? 1)),
    qmax: col((i) => String(i.client_quantity?.max ?? 10)),
    recurring: col((i) => i.recurring ?? "once"),
  };
};

export type SectionChange = { fields: Fields; items: Fields | null };

// sectionBody checks a section's heading, body and (for a pricing section) its whole item list,
// which replaces the items it has. Items left out keep the section's items as they are.
export const sectionBody = (b: Body, s: Pick<Section, "kind" | "pick_one">): Checked<SectionChange> => {
  const fix = 'Send {"heading": "Investment", "body": "…"}' + (s.kind === "pricing" ? ` and items. ${itemFix}` : ".");
  const head = firstProblem(
    [
      [b.heading === undefined || isStr(b.heading, 160), "heading must be text of up to 160 characters."],
      [b.body === undefined || isStr(b.body, s.kind === "text" ? 20000 : 300), `body must be text of up to ${s.kind === "text" ? "20,000" : "300"} characters.`],
      [b.items === undefined || s.kind === "pricing", "Only a pricing section has items."],
      [b.items === undefined || (Array.isArray(b.items) && b.items.length <= 100), "items must be a list of up to 100 items."],
    ],
    "SECTION_INVALID",
    fix,
  );
  if (!head.ok) return head;
  const list = (b.items as unknown[] | undefined) ?? null;
  const bad = (list ?? []).map(itemProblem).find(Boolean);
  if (bad) return no("ITEM_INVALID", bad, itemFix);
  const fields = Object.fromEntries((["heading", "body"] as const).filter((k) => b[k] !== undefined).map((k) => [k, String(b[k])]));
  return ok({ fields, items: list ? itemsFields(list as ItemBody[], s.pick_one) : null });
};

export const newSectionKind = (b: Body): Checked<NewKind> =>
  sectionKinds.includes(b.kind as NewKind) ? ok(b.kind as NewKind) : no("SECTION_INVALID", `kind must be one of ${sectionKinds.join(", ")}.`, 'Send {"kind": "text", "heading": "The project", "body": "…"}.');

// ----- Price list -----

// priceItemBody checks a price list item, over the one it changes when there is one, and turns it
// into the price list form's fields.
export const priceItemBody = (b: Body, was?: { name: string; description: string; unit_price: number; unit: string; recurring: string }): Checked<Fields> => {
  const merged = {
    name: b.name ?? was?.name,
    description: b.description ?? was?.description ?? "",
    unit_price_cents: b.unit_price_cents ?? was?.unit_price,
    unit: b.unit ?? was?.unit ?? "",
    recurring: b.recurring ?? was?.recurring ?? "once",
  };
  const checked = firstProblem(
    [
      [isStr(merged.name, 160) && (merged.name as string).trim() !== "", "name must be text of 1 to 160 characters."],
      [isStr(merged.description, 600), "description must be text of up to 600 characters."],
      [isCents(merged.unit_price_cents), "unit_price_cents must be a whole number of cents, 0 or more."],
      [isStr(merged.unit, 20), "unit must be text of up to 20 characters, like hour."],
      [merged.recurring === "once" || merged.recurring === "month", "recurring must be once or month."],
    ],
    "PRICE_ITEM_INVALID",
    'Send {"name": "Strategy workshop", "unit_price_cents": 180000, "unit": "day"}.',
  );
  if (!checked.ok) return checked;
  return ok({ name: String(merged.name), description: String(merged.description), price: centsText(merged.unit_price_cents as number), unit: String(merged.unit), recurring: String(merged.recurring) });
};

// ----- Sending, following up, answering -----

export type Send = { how: "email" | "link"; client_name?: string; client_email?: string; note: string };

// sendBody checks how a proposal goes out: by email (the default) to client.email or the address
// already on it, or as a link the business sends itself.
export const sendBody = (b: Body, p: Pick<Proposal, "client_email">): Checked<Send> => {
  const how = b.how ?? "email";
  const client = b.client === undefined ? {} : asBody(b.client);
  const email = typeof client?.email === "string" ? client.email.trim().toLowerCase() : undefined;
  const checked = firstProblem(
    [
      [how === "email" || how === "link", "how must be email or link."],
      [client !== undefined, "client must be an object: {name, email}."],
      [client?.name === undefined || isStr(client.name, 120), "client.name must be text of up to 120 characters."],
      [client?.email === undefined || (typeof email === "string" && (email === "" || isEmail(email))), "client.email is not an email address."],
      [how === "link" || isEmail(email ?? p.client_email), "Sending by email needs the client's email address."],
      [b.note === undefined || isStr(b.note, 4000), "note must be text of up to 4,000 characters."],
    ],
    "SEND_INVALID",
    'Send {"client": {"name": "Ana Silva", "email": "ana@example.com"}, "note": "…"}, or {"how": "link"} to send the link yourself.',
  );
  if (!checked.ok) return checked;
  return ok({ how: how as Send["how"], client_name: typeof client?.name === "string" ? client.name.trim() : undefined, client_email: email, note: typeof b.note === "string" ? b.note.trim() : "" });
};

export const textBody = (b: Body, key: string, max: number, required: boolean, code: string): Checked<string> => {
  const v = b[key];
  if (v === undefined && !required) return ok("");
  return isStr(v, max) && (!required || (v as string).trim() !== "") ? ok((v as string).trim()) : no(code, `${key} must be text of ${required ? "1" : "0"} to ${max} characters.`, `Send {"${key}": "…"}.`);
};

// ----- What comes back -----

const totalsJson = (t: Totals) => ({ subtotal_cents: t.subtotal, discount_cents: t.discount, tax_cents: t.tax, total_cents: t.total });

export const lineJson = (l: Line) => ({
  item_id: l.item_id,
  section_id: l.section_id,
  name: l.name,
  quantity: l.quantity,
  unit: l.unit,
  unit_price_cents: l.unit_price,
  amount_cents: l.amount,
  recurring: l.recurring,
});

export const quoteJson = (q: Quote) => ({ lines: q.lines.map(lineJson), once: totalsJson(q.once), monthly: totalsJson(q.month), deposit_cents: q.deposit });

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

// proposalJson is one proposal (or template) as lists show it. status is what the screens show:
// draft, sent, viewed, expired, accepted or declined.
export const proposalJson = (p: Proposal, now: Date, shareUrl: string) => ({
  id: p.id,
  title: p.title,
  subtitle: p.subtitle,
  status: p.is_template ? "template" : shownStatus(p, now),
  client: { name: p.client_name, company: p.client_company, email: p.client_email },
  currency: p.currency,
  tax_mode: p.tax_mode,
  tax_rate: Number(bpText(p.gst_rate_bp)),
  discount: Number(bpText(p.discount_bp)),
  deposit: Number(bpText(p.deposit_bp)),
  expires_on: p.expires_on,
  value_cents: p.value_cents,
  owner: { name: p.owner_name, email: p.owner_email },
  share_url: p.is_template ? null : shareUrl,
  view_count: p.view_count,
  created_at: iso(p.created_at),
  updated_at: iso(p.updated_at),
  sent_at: iso(p.sent_at),
  first_viewed_at: iso(p.first_viewed_at),
  last_viewed_at: iso(p.last_viewed_at),
  decided_at: iso(p.decided_at),
  decline_reason: p.status === "declined" ? p.decline_reason : null,
});

export const itemJson = (i: Item) => ({
  id: i.id,
  name: i.name,
  description: i.description,
  unit_price_cents: i.unit_price,
  quantity: i.quantity,
  unit: i.unit,
  mode: i.mode,
  selected: i.selected,
  recommended: i.recommended,
  client_quantity: i.qty_editable ? { min: i.qty_min, max: i.qty_max } : null,
  recurring: i.recurring,
});

export const sectionJson = (s: Section) => ({
  id: s.id,
  kind: s.kind === "pricing" && s.pick_one ? "packages" : s.kind,
  heading: s.heading,
  body: s.body,
  ...(s.kind === "pricing" ? { items: s.items.map(itemJson) } : {}),
});

// acceptanceJson is what the client agreed to: who signed, what they chose and the totals, from
// the frozen copy, with its fingerprint.
export const acceptanceJson = (proposalId: number, a: { frozen: Frozen; fingerprint: string; created_at: Date }, pdfUrl: string) => ({
  proposal_id: proposalId,
  title: a.frozen.doc.proposal.title,
  currency: a.frozen.doc.proposal.currency,
  accepted_at: a.frozen.acceptance.accepted_at,
  accepted_by: { name: a.frozen.acceptance.name, email: a.frozen.acceptance.email },
  signature: a.frozen.acceptance.signature.kind === "typed" ? { kind: "typed", text: a.frozen.acceptance.signature.text } : { kind: "drawn" },
  ip: a.frozen.acceptance.ip,
  user_agent: a.frozen.acceptance.user_agent,
  selections: a.frozen.selections,
  ...quoteJson(a.frozen.quote),
  fingerprint: a.fingerprint,
  pdf_url: pdfUrl,
});
