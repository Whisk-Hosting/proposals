// Reading and writing rows. Each function is one small query or one short transaction;
// decisions live in model.ts and pricing.ts.
import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db.js";
import type { Frozen, Proposal } from "./model.js";
import { defaultSelections, quote, type Item, type Recurring, type Section, type TaxMode } from "./pricing.js";

export type Settings = {
  business_name: string;
  accent: string;
  logo_upload_id: string | null;
  currency: string;
  tax_mode: TaxMode;
  gst_rate_bp: number;
  valid_days: number;
  notify_email: string;
  email_from: string;
  email_on: boolean;
  webhook_url: string;
  webhook_secret: string;
};

const defaults: Settings = {
  business_name: "Your business",
  accent: "#2f5bea",
  logo_upload_id: null,
  currency: "USD",
  tax_mode: "exclusive",
  gst_rate_bp: 0,
  valid_days: 30,
  notify_email: "",
  email_from: "",
  email_on: true,
  webhook_url: "",
  webhook_secret: "",
};

export const settings = async (): Promise<Settings> => {
  const [s] = await sql<Settings[]>`select business_name, accent, logo_upload_id, currency, tax_mode, gst_rate_bp, valid_days,
    notify_email, email_from, email_on, webhook_url, webhook_secret from settings where id = 1`;
  return s ?? defaults;
};

export const saveSettings = (s: Partial<Settings>) => {
  const cols = Object.keys(s) as (keyof Settings)[];
  return cols.length === 0 ? Promise.resolve() : sql`update settings set ${sql(s, cols)}, updated_at = now() where id = 1`;
};

// ----- Proposals -----

const cols = sql`id, token, is_template, title, subtitle, client_name, client_company, client_email, cover_upload_id, currency, tax_mode,
  gst_rate_bp, discount_bp, deposit_bp, to_char(expires_on, 'YYYY-MM-DD') as expires_on, status, value_cents::float8 as value_cents,
  owner_email, owner_name, created_at, updated_at, sent_at, first_viewed_at, last_viewed_at, view_count, followed_up_at, decided_at, decline_reason`;

export const proposals = (templates: boolean) =>
  sql<Proposal[]>`select ${cols} from proposals where is_template = ${templates} order by updated_at desc limit 500`;

export const proposalById = async (id: number): Promise<Proposal | undefined> => (await sql<Proposal[]>`select ${cols} from proposals where id = ${id}`)[0];

export const proposalByToken = async (token: string): Promise<Proposal | undefined> =>
  /^[A-Za-z0-9_-]{20,64}$/.test(token) ? (await sql<Proposal[]>`select ${cols} from proposals where token = ${token} and not is_template`)[0] : undefined;

const itemCols = sql`i.id, i.section_id, i.position, i.name, i.description, i.unit_price::float8 as unit_price, i.quantity, i.unit, i.mode,
  i.selected, i.recommended, i.qty_editable, i.qty_min, i.qty_max, i.recurring`;

type SectionRow = Omit<Section, "items"> & { position: number };
type ItemRow = Item & { section_id: number; position: number };

export const sectionsFor = async (proposalId: number): Promise<Section[]> => {
  const [secs, items] = await Promise.all([
    sql<SectionRow[]>`select id, position, kind, heading, body, image_upload_id, pick_one from sections where proposal_id = ${proposalId} order by position, id`,
    sql<ItemRow[]>`select ${itemCols} from items i join sections s on s.id = i.section_id where s.proposal_id = ${proposalId} order by i.position, i.id`,
  ]);
  return secs.map(({ position: _, ...s }) => ({
    ...s,
    items: items.filter((i) => i.section_id === s.id).map(({ section_id: _s, position: _p, ...i }) => i),
  }));
};

export const newToken = () => randomBytes(18).toString("base64url");

export type ProposalFields = Pick<Proposal, "title" | "subtitle" | "client_name" | "client_company" | "client_email" | "currency" | "tax_mode" | "gst_rate_bp" | "discount_bp" | "deposit_bp" | "expires_on">;

export const createProposal = async (f: ProposalFields & { is_template?: boolean; owner_email: string; owner_name: string }): Promise<number> => {
  const [row] = await sql<{ id: number }[]>`insert into proposals ${sql({ ...f, is_template: f.is_template ?? false, token: newToken() })} returning id`;
  return row.id;
};

export const updateProposal = (id: number, f: Partial<ProposalFields & { cover_upload_id: string | null }>) => {
  const keys = Object.keys(f) as (keyof typeof f)[];
  return keys.length === 0 ? Promise.resolve() : sql`update proposals set ${sql(f, keys)}, updated_at = now() where id = ${id}`;
};

// refreshValue stores the total with the starting choices, so lists can show and sum it.
export const refreshValue = async (id: number) => {
  const p = await proposalById(id);
  if (!p) return;
  const secs = await sectionsFor(id);
  const q = quote(secs, defaultSelections(secs), p);
  await sql`update proposals set value_cents = ${q.once.total + q.month.total * 12}, updated_at = now() where id = ${id}`;
};

export const deleteProposal = (id: number) => sql`delete from proposals where id = ${id}`;

// duplicate copies a proposal or template, with its sections and items, as a new draft.
export const duplicate = (id: number, asTemplate: boolean, owner: { email: string; name: string }, title?: string): Promise<number | undefined> =>
  sql.begin(async (tx) => {
    const [p] = await tx<{ id: number }[]>`insert into proposals (token, is_template, title, subtitle, client_name, client_company, client_email, cover_upload_id,
        currency, tax_mode, gst_rate_bp, discount_bp, deposit_bp, value_cents, owner_email, owner_name)
      select ${newToken()}, ${asTemplate}, coalesce(${title ?? null}, title), subtitle,
        case when ${asTemplate} then '' else client_name end, case when ${asTemplate} then '' else client_company end,
        case when ${asTemplate} then '' else client_email end, cover_upload_id,
        currency, tax_mode, gst_rate_bp, discount_bp, deposit_bp, value_cents, ${owner.email}, ${owner.name}
      from proposals where id = ${id} returning id`;
    if (!p) return undefined;
    const secs = await tx<{ id: number }[]>`select id from sections where proposal_id = ${id} order by position, id`;
    for (const s of secs) {
      const [ns] = await tx<{ id: number }[]>`insert into sections (proposal_id, position, kind, heading, body, image_upload_id, pick_one)
        select ${p.id}, position, kind, heading, body, image_upload_id, pick_one from sections where id = ${s.id} returning id`;
      await tx`insert into items (section_id, position, name, description, unit_price, quantity, unit, mode, selected, recommended, qty_editable, qty_min, qty_max, recurring)
        select ${ns.id}, position, name, description, unit_price, quantity, unit, mode, selected, recommended, qty_editable, qty_min, qty_max, recurring
        from items where section_id = ${s.id}`;
    }
    return p.id;
  });

// ----- Sections and items -----

export const sectionOf = async (sectionId: number) =>
  (await sql<{ id: number; proposal_id: number; kind: Section["kind"] }[]>`select id, proposal_id, kind from sections where id = ${sectionId}`)[0];

export const addSection = async (proposalId: number, s: Pick<Section, "kind" | "heading" | "body" | "pick_one">): Promise<number> => {
  const [row] = await sql<{ id: number }[]>`insert into sections (proposal_id, position, kind, heading, body, pick_one)
    values (${proposalId}, (select coalesce(max(position), -1) + 1 from sections where proposal_id = ${proposalId}), ${s.kind}, ${s.heading}, ${s.body}, ${s.pick_one})
    returning id`;
  return row.id;
};

export const updateSection = (id: number, s: Partial<Pick<Section, "heading" | "body" | "pick_one" | "image_upload_id">>) => {
  const keys = Object.keys(s) as (keyof typeof s)[];
  return keys.length === 0 ? Promise.resolve() : sql`update sections set ${sql(s, keys)} where id = ${id}`;
};

export const deleteSection = (id: number) => sql`delete from sections where id = ${id}`;

// moveSection swaps a section with its neighbour above (-1) or below (+1), renumbering all of
// the proposal's sections so positions stay 0, 1, 2…
export const moveSection = (proposalId: number, id: number, by: -1 | 1) =>
  sql.begin(async (tx) => {
    const ids = (await tx<{ id: number }[]>`select id from sections where proposal_id = ${proposalId} order by position, id for update`).map((r) => r.id);
    const i = ids.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const order = ids.map((x, k) => (k === i ? ids[j] : k === j ? ids[i] : x));
    for (const [pos, sid] of order.entries()) await tx`update sections set position = ${pos} where id = ${sid}`;
  });

export type ItemInput = Omit<Item, "id"> & { id: number | null };

// saveItems makes the section's items exactly the list given, in order: rows with an id of
// this section are updated (so a client's choices keep pointing at them), new rows inserted,
// and rows left out removed.
export const saveItems = (sectionId: number, items: readonly ItemInput[]) =>
  sql.begin(async (tx) => {
    const existing = new Set((await tx<{ id: number }[]>`select id from items where section_id = ${sectionId}`).map((r) => r.id));
    const keep = items.flatMap((i) => (i.id !== null && existing.has(i.id) ? [i.id] : []));
    await tx`delete from items where section_id = ${sectionId} and not (id = any(${keep}::int[]))`;
    for (const [position, { id, ...i }] of items.entries()) {
      const row = { ...i, position };
      if (id !== null && existing.has(id)) await tx`update items set ${tx(row)} where id = ${id} and section_id = ${sectionId}`;
      else await tx`insert into items ${tx({ ...row, section_id: sectionId })}`;
    }
  });

// ----- What happens to a proposal -----

export const markSent = (id: number) =>
  sql`update proposals set status = 'sent', sent_at = coalesce(sent_at, now()), updated_at = now() where id = ${id} and status = 'draft'`;

// Taking a proposal back to draft (to change it) keeps its link and its history.
export const backToDraft = (id: number) => sql`update proposals set status = 'draft', updated_at = now() where id = ${id} and status = 'sent'`;

// recordView counts one view and says whether it was the first.
export const recordView = async (id: number): Promise<boolean> => {
  const [row] = await sql<{ first: boolean }[]>`update proposals set view_count = view_count + 1, last_viewed_at = now(),
      first_viewed_at = coalesce(first_viewed_at, now())
    where id = ${id} returning (view_count = 1) as first`;
  return row?.first ?? false;
};

export const markFollowedUp = (id: number) => sql`update proposals set followed_up_at = now() where id = ${id}`;

// accept freezes the proposal. It only succeeds once, and only on a sent proposal.
export const accept = (id: number, frozen: Frozen, fingerprint: string): Promise<boolean> =>
  sql.begin(async (tx) => {
    const done = await tx`update proposals set status = 'accepted', decided_at = now(), updated_at = now() where id = ${id} and status = 'sent' returning id`;
    if (done.length === 0) return false;
    await tx`insert into acceptances (proposal_id, frozen, fingerprint) values (${id}, ${tx.json(frozen as never)}, ${fingerprint})`;
    return true;
  });

export const decline = async (id: number, reason: string): Promise<boolean> =>
  (await sql`update proposals set status = 'declined', decided_at = now(), decline_reason = ${reason}, updated_at = now() where id = ${id} and status = 'sent' returning id`).length > 0;

export const acceptance = async (id: number): Promise<{ frozen: Frozen; fingerprint: string; created_at: Date } | undefined> =>
  (await sql<{ frozen: Frozen; fingerprint: string; created_at: Date }[]>`select frozen, fingerprint, created_at from acceptances where proposal_id = ${id}`)[0];

// ----- Questions and activity -----

export type Question = { id: number; asked_by: string; asked_email: string; body: string; answer: string; answered_by: string; asked_at: Date; answered_at: Date | null };

export const questions = (proposalId: number) =>
  sql<Question[]>`select id, asked_by, asked_email, body, answer, answered_by, asked_at, answered_at from questions where proposal_id = ${proposalId} order by asked_at, id`;

export const ask = async (proposalId: number, q: { asked_by: string; asked_email: string; body: string }): Promise<number> =>
  (await sql<{ id: number }[]>`insert into questions ${sql({ ...q, proposal_id: proposalId })} returning id`)[0].id;

export const answer = async (proposalId: number, questionId: number, text: string, by: string): Promise<Question | undefined> =>
  (await sql<Question[]>`update questions set answer = ${text}, answered_by = ${by}, answered_at = now()
    where id = ${questionId} and proposal_id = ${proposalId}
    returning id, asked_by, asked_email, body, answer, answered_by, asked_at, answered_at`)[0];

export const unansweredCount = async () => Number((await sql<{ n: number }[]>`select count(*)::int as n from questions where answered_at is null`)[0]?.n ?? 0);

export type Activity = { kind: string; actor: string; detail: string; at: Date };

export const activity = (proposalId: number, limit = 50) =>
  sql<Activity[]>`select kind, actor, detail, at from activity where proposal_id = ${proposalId} order by at desc, id desc limit ${limit}`;

export const log = (proposalId: number, kind: string, actor: string, detail = "") =>
  sql`insert into activity (proposal_id, kind, actor, detail) values (${proposalId}, ${kind}, ${actor}, ${detail})`;

// The latest happenings across every proposal, for the home page.
export const recentActivity = (limit = 8) =>
  sql<(Activity & { proposal_id: number; title: string })[]>`select a.kind, a.actor, a.detail, a.at, a.proposal_id, p.title
    from activity a join proposals p on p.id = a.proposal_id
    where a.kind in ('viewed', 'question', 'accepted', 'declined') order by a.at desc, a.id desc limit ${limit}`;

// ----- Price list -----

export type PriceItem = { id: number; name: string; description: string; unit_price: number; unit: string; recurring: Recurring };

export const priceList = () =>
  sql<PriceItem[]>`select id, name, description, unit_price::float8 as unit_price, unit, recurring from price_list order by lower(name), id`;

export const priceItem = async (id: number) =>
  (await sql<PriceItem[]>`select id, name, description, unit_price::float8 as unit_price, unit, recurring from price_list where id = ${id}`)[0];

// savePriceItem changes an item, or adds one when there is no id, and answers its id.
export const savePriceItem = async (id: number | null, f: Omit<PriceItem, "id">): Promise<number> => {
  if (id) {
    await sql`update price_list set ${sql(f)} where id = ${id}`;
    return id;
  }
  return (await sql<{ id: number }[]>`insert into price_list ${sql(f)} returning id`)[0].id;
};

export const deletePriceItem = (id: number) => sql`delete from price_list where id = ${id}`;

// ----- Email -----

export type Email = { id: number; kind: string; to_email: string; subject: string; html: string; text: string; reply_to: string; status: string; error: string; created_at: Date; sent_at: Date | null };

export const queueEmail = async (e: { kind: string; to: string; subject: string; html: string; text: string; reply_to?: string }): Promise<number> =>
  (await sql<{ id: number }[]>`insert into emails (kind, to_email, subject, html, text, reply_to)
    values (${e.kind}, ${e.to}, ${e.subject}, ${e.html}, ${e.text}, ${e.reply_to ?? ""}) returning id`)[0].id;

export const emailById = async (id: number) => (await sql<Email[]>`select * from emails where id = ${id}`)[0];

export const markEmail = (id: number, status: "sent" | "failed" | "skipped" | "demo", error = "") =>
  sql`update emails set status = ${status}, error = ${error}, sent_at = case when ${status} = 'sent' then now() else sent_at end where id = ${id}`;

export const recentEmails = (limit = 20) =>
  sql<Email[]>`select id, kind, to_email, subject, '' as html, '' as text, reply_to, status, error, created_at, sent_at from emails order by created_at desc limit ${limit}`;

// ----- Webhook deliveries -----

export type Delivery = { id: number; event: string; url: string; payload: unknown; status: string; attempts: number; last_status: number | null; last_error: string; created_at: Date };

export const recordDelivery = async (event: string, url: string, payload: unknown, status: "pending" | "demo" = "pending"): Promise<number> =>
  (await sql<{ id: number }[]>`insert into deliveries (event, url, payload, status) values (${event}, ${url}, ${sql.json(payload as never)}, ${status}) returning id`)[0].id;

export const deliveryById = async (id: number) => (await sql<Delivery[]>`select * from deliveries where id = ${id}`)[0];

export const deliveryAttempt = (id: number, status: number | null, error: string) =>
  sql`update deliveries set attempts = attempts + 1, last_status = ${status}, last_error = ${error},
    status = case when ${error} = '' then 'delivered' else status end, updated_at = now() where id = ${id}`;

export const deliveryFailed = (id: number) => sql`update deliveries set status = 'failed', updated_at = now() where id = ${id} and status = 'pending'`;

export const recentDeliveries = (limit = 15) => sql<Delivery[]>`select * from deliveries order by created_at desc limit ${limit}`;

// ----- API keys -----

export type ApiKey = { id: number; label: string; prefix: string; created_by: string; created_at: Date; last_used_at: Date | null; revoked_at: Date | null };

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

// createKey makes a key, "prp_" and 32 random characters, and keeps only its hash and its first
// ten characters; the caller shows the key once.
export const createKey = async (label: string, by: string): Promise<string> => {
  const key = `prp_${randomBytes(24).toString("base64url")}`;
  await sql`insert into api_keys (label, prefix, hash, created_by) values (${label}, ${key.slice(0, 10)}, ${hashKey(key)}, ${by})`;
  return key;
};

// keyFor finds a live key and notes that it was used.
export const keyFor = async (key: string): Promise<ApiKey | undefined> =>
  (await sql<ApiKey[]>`update api_keys set last_used_at = now() where hash = ${hashKey(key)} and revoked_at is null
    returning id, label, prefix, created_by, created_at, last_used_at, revoked_at`)[0];

export const apiKeys = () =>
  sql<ApiKey[]>`select id, label, prefix, created_by, created_at, last_used_at, revoked_at from api_keys order by revoked_at nulls first, id desc limit 100`;

export const revokeKey = async (id: number) =>
  (await sql<{ label: string }[]>`update api_keys set revoked_at = now() where id = ${id} and revoked_at is null returning label`)[0];

// ----- Demo -----

// emptyAll clears every table the app owns, for the demo's nightly reset. It names the tables
// this app created in migrations/, never anything found by pattern.
export const emptyAll = () =>
  sql.begin(async (tx) => {
    await tx`truncate proposals, sections, items, price_list, acceptances, questions, activity, emails, deliveries, api_keys restart identity cascade`;
    await tx`delete from settings`;
    await tx`insert into settings (id) values (1)`;
  });
