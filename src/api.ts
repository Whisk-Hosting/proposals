// /api/v1: everything the staff screens do, for scripts and agents. Each call carries a key an
// owner or admin made under Settings > API keys. Money is whole cents; percentages are numbers
// (8.5 is 8.5%). Errors are {"error": {code, message, fix}}. Decisions and checks live in
// requests.ts, editing.ts and model.ts; this file loads rows, calls them and stores the result.
import { Hono, type Context } from "hono";
import * as edit from "./editing.js";
import { answerEmail, followUpEmail, proposalEmail } from "./emails.js";
import { email } from "./events.js";
import { addDays, dayIn, isEmail, isLocked, shownStatus, type Proposal } from "./model.js";
import { defaultSelections, quote } from "./pricing.js";
import { webhook } from "./proposals.js";
import * as rq from "./requests.js";
import * as store from "./store.js";
import { baseUrl, clientLink } from "./web.js";

type Env = { Variables: { key: store.ApiKey } };
export const api = new Hono<Env>();

type Status = 400 | 401 | 404 | 409 | 422;
const fail = (c: Context, status: Status, code: string, message: string, fix: string) => c.json({ error: { code, message, fix } }, status);
const problem = (c: Context, p: rq.Problem, status: Status = 422) => c.json({ error: p }, status);

const endpoints = [
  "GET /api/v1/proposals?status=draft|sent|viewed|expired|accepted|declined&limit=&offset=",
  "POST /api/v1/proposals {template_id?, title?, subtitle?, client?: {name, company, email}, currency?, tax_mode?: exclusive|inclusive|none, tax_rate?, discount?, deposit?, expires_on?: YYYY-MM-DD}",
  "GET /api/v1/proposals/:id   (with sections, items, totals, questions and the share_url)",
  "PATCH /api/v1/proposals/:id {title?, subtitle?, client?, currency?, tax_mode?, tax_rate?, discount?, deposit?, expires_on?}",
  "DELETE /api/v1/proposals/:id",
  "POST /api/v1/proposals/:id/send {how?: email|link, client?: {name, email}, note?}",
  "POST /api/v1/proposals/:id/withdraw   (back to draft; the link shows it as not ready)",
  "POST /api/v1/proposals/:id/follow-up {note?}",
  "POST /api/v1/proposals/:id/duplicate {title?}",
  "POST /api/v1/proposals/:id/questions/:question_id/answer {answer}",
  "GET /api/v1/proposals/:id/acceptance",
  "POST /api/v1/proposals/:id/sections {kind: text|pricing|packages|image, heading?, body?, items?}",
  "PATCH /api/v1/sections/:id {heading?, body?, items?: [{id?, name, description?, unit_price_cents, quantity?, unit?, mode?: fixed|optional, selected?, recommended?, client_quantity?: {min, max}, recurring?: once|month}]}",
  "POST /api/v1/sections/:id/move {by: -1|1}",
  "DELETE /api/v1/sections/:id",
  "GET /api/v1/templates?limit=&offset=",
  "POST /api/v1/templates {from_proposal_id, title?}",
  "GET /api/v1/templates/:id",
  "PATCH /api/v1/templates/:id {title?, subtitle?, currency?, tax_mode?, tax_rate?, discount?, deposit?}",
  "DELETE /api/v1/templates/:id",
  "GET /api/v1/price-items?limit=&offset=",
  "POST /api/v1/price-items {name, description?, unit_price_cents, unit?, recurring?: once|month}",
  "GET /api/v1/price-items/:id",
  "PATCH /api/v1/price-items/:id {name?, description?, unit_price_cents?, unit?, recurring?}",
  "DELETE /api/v1/price-items/:id",
  "GET /api/v1/acceptances?limit=&offset=   (newest first: who signed, what they chose, the totals)",
];

// The list of endpoints needs no key, so an agent can find its way before it has one. Every
// route after the middleware below does.
api.get("/", (c) =>
  c.json({
    endpoints,
    auth: "Authorization: Bearer prp_… (or Basic auth with the key as the user name, X-Api-Key, or ?token=). Owners and admins make keys under Settings > API keys.",
    money: "Whole cents. Percentages (tax_rate, discount, deposit) are numbers: 8.5 is 8.5%.",
    errors: '{"error": {"code", "message", "fix"}}',
  }),
);

api.use("*", async (c, next) => {
  const raw = rq.keyFrom((n) => c.req.header(n), c.req.query("token"));
  const key = rq.looksLikeKey(raw) ? await store.keyFor(raw) : undefined;
  if (!key)
    return fail(c, 401, raw ? "API_KEY_INVALID" : "API_KEY_REQUIRED", raw ? "That API key is not valid, or it was turned off." : "This needs an API key.", "An owner or admin makes keys under Settings > API keys. Send one as Authorization: Bearer <key>.");
  c.set("key", key);
  c.header("Cache-Control", "no-store");
  await next();
});

const actor = (c: Context<Env>) => `API key "${c.get("key").label}"`;
const owner = (c: Context<Env>) => ({ email: c.get("key").created_by.includes("@") ? c.get("key").created_by : "", name: actor(c) });
const today = () => dayIn(new Date());

const idOf = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : 0;
};

// body reads a JSON object; anything else answers 400.
const body = async (c: Context): Promise<rq.Body | Response> => {
  const text = await c.req.text();
  if (!text.trim()) return {};
  const parsed = rq.asBody(await Promise.resolve().then(() => JSON.parse(text)).catch(() => undefined));
  return parsed ?? fail(c, 400, "BODY_INVALID", "The body is not a JSON object.", "Send Content-Type: application/json and a body like {\"title\": \"…\"}.");
};

const pageFrom = (c: Context) => rq.pageOf(c.req.query("limit"), c.req.query("offset"));

// ----- Proposals and templates -----

type Kind = { path: "proposals" | "templates"; template: boolean; noun: string };
const kinds: Record<Kind["path"], Kind> = {
  proposals: { path: "proposals", template: false, noun: "proposal" },
  templates: { path: "templates", template: true, noun: "template" },
};

const notFound = (c: Context, k: Kind) => fail(c, 404, `${k.noun.toUpperCase()}_NOT_FOUND`, `No ${k.noun} has that id.`, `GET /api/v1/${k.path} lists each ${k.noun}'s id.`);

// load finds a proposal or a template by id, of the kind asked for.
const load = async (id: number, k: Kind) => {
  const p = id ? await store.proposalById(id) : undefined;
  return p && p.is_template === k.template ? p : undefined;
};

const locked = (c: Context, p: Proposal) =>
  fail(c, 409, "PROPOSAL_LOCKED", `This proposal was ${p.status} and can't change: what the client decided stays as it was.`, "POST /api/v1/proposals/:id/duplicate makes an editable copy.");

const summary = (p: Proposal) => rq.proposalJson(p, new Date(), clientLink(p.token));

const detail = async (p: Proposal) => {
  const [sections, questions, accepted] = await Promise.all([store.sectionsFor(p.id), store.questions(p.id), p.status === "accepted" ? store.acceptance(p.id) : undefined]);
  return {
    ...summary(p),
    sections: sections.map(rq.sectionJson),
    // The totals with the starting choices; once accepted, with the client's.
    totals: rq.quoteJson(accepted ? accepted.frozen.quote : quote(sections, defaultSelections(sections), p)),
    questions: questions.map((q) => ({ id: q.id, asked_by: q.asked_by, asked_email: q.asked_email, body: q.body, answer: q.answer || null, answered_by: q.answered_by || null, asked_at: q.asked_at, answered_at: q.answered_at })),
    acceptance: accepted ? rq.acceptanceJson(p.id, accepted, `${clientLink(p.token)}/pdf`) : null,
  };
};

const listOf = (k: Kind) => async (c: Context<Env>) => {
  const page = pageFrom(c);
  if (!page.ok) return problem(c, page.problem, 400);
  const status = rq.statusFilter(k.template ? undefined : c.req.query("status"));
  if (!status.ok) return problem(c, status.problem, 400);
  const now = new Date();
  const all = (await store.proposals(k.template)).filter((p) => !status.value || shownStatus(p, now) === status.value);
  const { items, total, next_offset } = rq.paginate(all, page.value);
  return c.json({ [k.path]: items.map(summary), total, next_offset });
};

const getOne = (k: Kind) => async (c: Context<Env>) => {
  const p = await load(idOf(c.req.param("id")), k);
  return p ? c.json({ [k.noun]: await detail(p) }) : notFound(c, k);
};

const patchOne = (k: Kind) => async (c: Context<Env>) => {
  const p = await load(idOf(c.req.param("id")), k);
  if (!p) return notFound(c, k);
  if (isLocked(p)) return locked(c, p);
  const b = await body(c);
  if (b instanceof Response) return b;
  const f = rq.proposalBody(b);
  if (!f.ok) return problem(c, f.problem);
  await store.updateProposal(p.id, edit.proposalFields(f.value, p));
  await store.refreshValue(p.id);
  return c.json({ [k.noun]: await detail((await store.proposalById(p.id))!) });
};

const deleteOne = (k: Kind) => async (c: Context<Env>) => {
  const p = await load(idOf(c.req.param("id")), k);
  if (!p) return notFound(c, k);
  await store.deleteProposal(p.id);
  return c.body(null, 204);
};

for (const k of Object.values(kinds)) {
  api.get(`/${k.path}`, listOf(k));
  api.get(`/${k.path}/:id`, getOne(k));
  api.patch(`/${k.path}/:id`, patchOne(k));
  api.delete(`/${k.path}/:id`, deleteOne(k));
}

// A new proposal starts like the screen's New proposal (a text section and a pricing section),
// or as a copy of a template, then takes any fields sent.
api.post("/proposals", async (c) => {
  const b = await body(c);
  if (b instanceof Response) return b;
  const f = rq.proposalBody(b);
  if (!f.ok) return problem(c, f.problem);
  const s = await store.settings();
  const by = owner(c);
  let id: number;
  if (b.template_id !== undefined) {
    const t = await load(idOf(String(b.template_id)), kinds.templates);
    if (!t) return fail(c, 404, "TEMPLATE_NOT_FOUND", "No template has that template_id.", "GET /api/v1/templates lists each template's id.");
    const copied = await store.duplicate(t.id, false, by);
    if (!copied) return fail(c, 404, "TEMPLATE_NOT_FOUND", "No template has that template_id.", "GET /api/v1/templates lists each template's id.");
    id = copied;
    await store.updateProposal(id, { expires_on: addDays(today(), s.valid_days) });
    await store.log(id, "created", by.name, `From the template ${t.title}`);
  } else {
    id = await store.createProposal({ ...edit.blankProposal(s, today(), addDays), owner_email: by.email, owner_name: by.name });
    await store.addSection(id, { kind: "text", heading: "The project", body: "", pick_one: false });
    await store.addSection(id, edit.newSection("pricing"));
    await store.log(id, "created", by.name);
  }
  const p = (await store.proposalById(id))!;
  await store.updateProposal(id, edit.proposalFields(f.value, p));
  await store.refreshValue(id);
  return c.json({ proposal: await detail((await store.proposalById(id))!) }, 201);
});

// Saving a proposal as a template, like the editor's Save as template.
api.post("/templates", async (c) => {
  const b = await body(c);
  if (b instanceof Response) return b;
  const title = rq.textBody(b, "title", 160, false, "TEMPLATE_INVALID");
  if (!title.ok) return problem(c, title.problem);
  const from = await store.proposalById(idOf(String(b.from_proposal_id ?? "")));
  if (!from) return fail(c, 404, "PROPOSAL_NOT_FOUND", "No proposal has that from_proposal_id.", 'Send {"from_proposal_id": 12}. GET /api/v1/proposals lists the ids.');
  const id = await store.duplicate(from.id, true, owner(c), title.value || undefined);
  if (!id) return fail(c, 404, "PROPOSAL_NOT_FOUND", "No proposal has that from_proposal_id.", "GET /api/v1/proposals lists the ids.");
  return c.json({ template: await detail((await store.proposalById(id))!) }, 201);
});

api.post("/proposals/:id/duplicate", async (c) => {
  const p = await load(idOf(c.req.param("id")), kinds.proposals);
  if (!p) return notFound(c, kinds.proposals);
  const b = await body(c);
  if (b instanceof Response) return b;
  const title = rq.textBody(b, "title", 160, false, "PROPOSAL_INVALID");
  if (!title.ok) return problem(c, title.problem);
  const id = await store.duplicate(p.id, false, owner(c), title.value || `${p.title} (copy)`);
  if (!id) return notFound(c, kinds.proposals);
  await store.updateProposal(id, { expires_on: addDays(today(), (await store.settings()).valid_days) });
  await store.log(id, "created", actor(c), `Copied from ${p.title}`);
  return c.json({ proposal: await detail((await store.proposalById(id))!) }, 201);
});

// ----- Sending, withdrawing, following up, answering -----

api.post("/proposals/:id/send", async (c) => {
  const p = await load(idOf(c.req.param("id")), kinds.proposals);
  if (!p) return notFound(c, kinds.proposals);
  if (isLocked(p)) return locked(c, p);
  const b = await body(c);
  if (b instanceof Response) return b;
  const s = rq.sendBody(b, p);
  if (!s.ok) return problem(c, s.problem);
  const next = { ...p, client_name: s.value.client_name ?? p.client_name, client_email: s.value.client_email ?? p.client_email };
  await store.updateProposal(p.id, { client_name: next.client_name, client_email: next.client_email });
  await store.markSent(p.id);
  const by = owner(c);
  const byEmail = s.value.how === "email";
  await store.log(p.id, "sent", by.name, byEmail ? `Emailed to ${next.client_email}` : "Link copied");
  if (byEmail) await email("proposal", proposalEmail(await store.settings(), next, clientLink(p.token), s.value.note, by.email || p.owner_email));
  const sent = (await store.proposalById(p.id))!;
  await webhook("proposal.sent", sent);
  return c.json({ proposal: summary(sent), emailed: byEmail });
});

api.post("/proposals/:id/withdraw", async (c) => {
  const p = await load(idOf(c.req.param("id")), kinds.proposals);
  if (!p) return notFound(c, kinds.proposals);
  if (isLocked(p)) return locked(c, p);
  if (p.status !== "sent") return fail(c, 409, "PROPOSAL_NOT_SENT", "Only a sent proposal can be withdrawn; this one is a draft.", "POST /api/v1/proposals/:id/send sends it.");
  await store.backToDraft(p.id);
  await store.log(p.id, "draft", actor(c));
  return c.json({ proposal: summary((await store.proposalById(p.id))!) });
});

api.post("/proposals/:id/follow-up", async (c) => {
  const p = await load(idOf(c.req.param("id")), kinds.proposals);
  if (!p) return notFound(c, kinds.proposals);
  if (p.status !== "sent") return fail(c, 409, "PROPOSAL_NOT_SENT", `Only a sent proposal gets a follow-up; this one is ${p.status}.`, "Send it first with POST /api/v1/proposals/:id/send.");
  if (!isEmail(p.client_email)) return fail(c, 409, "CLIENT_EMAIL_MISSING", "This proposal has no client email to follow up.", 'PATCH /api/v1/proposals/:id {"client": {"email": "…"}} first.');
  const b = await body(c);
  if (b instanceof Response) return b;
  const note = rq.textBody(b, "note", 2000, false, "FOLLOW_UP_INVALID");
  if (!note.ok) return problem(c, note.problem);
  const by = owner(c);
  await email("follow_up", followUpEmail(await store.settings(), p, clientLink(p.token), note.value, by.email || p.owner_email));
  await store.markFollowedUp(p.id);
  await store.log(p.id, "follow_up", by.name, note.value);
  return c.json({ proposal: summary((await store.proposalById(p.id))!) });
});

api.post("/proposals/:id/questions/:qid/answer", async (c) => {
  const p = await load(idOf(c.req.param("id")), kinds.proposals);
  if (!p) return notFound(c, kinds.proposals);
  if (isLocked(p)) return locked(c, p);
  const b = await body(c);
  if (b instanceof Response) return b;
  const text = rq.textBody(b, "answer", 2000, true, "ANSWER_INVALID");
  if (!text.ok) return problem(c, text.problem);
  const by = actor(c);
  const q = await store.answer(p.id, idOf(c.req.param("qid")), text.value, by);
  if (!q) return fail(c, 404, "QUESTION_NOT_FOUND", "This proposal has no question with that id.", "GET /api/v1/proposals/:id lists its questions.");
  await store.log(p.id, "answer", by, text.value);
  const to = q.asked_email || p.client_email;
  if (isEmail(to)) await email("answer", answerEmail(await store.settings(), p, to, clientLink(p.token), { body: q.body, answer: text.value, by }));
  return c.json({ question: { id: q.id, body: q.body, answer: q.answer, answered_by: q.answered_by, answered_at: q.answered_at }, emailed: isEmail(to) });
});

// ----- Accepted results -----

api.get("/proposals/:id/acceptance", async (c) => {
  const p = await load(idOf(c.req.param("id")), kinds.proposals);
  if (!p) return notFound(c, kinds.proposals);
  const a = p.status === "accepted" ? await store.acceptance(p.id) : undefined;
  if (!a) return fail(c, 404, "NOT_ACCEPTED", `This proposal is ${shownStatus(p, new Date())}, not accepted.`, "GET /api/v1/acceptances lists the accepted ones.");
  return c.json({ acceptance: rq.acceptanceJson(p.id, a, `${clientLink(p.token)}/pdf`) });
});

api.get("/acceptances", async (c) => {
  const page = pageFrom(c);
  if (!page.ok) return problem(c, page.problem, 400);
  const accepted = (await store.proposals(false))
    .filter((p) => p.status === "accepted")
    .sort((a, b) => new Date(b.decided_at ?? 0).getTime() - new Date(a.decided_at ?? 0).getTime());
  const { items, total, next_offset } = rq.paginate(accepted, page.value);
  const rows = await Promise.all(items.map(async (p) => ((a) => (a ? rq.acceptanceJson(p.id, a, `${clientLink(p.token)}/pdf`) : null))(await store.acceptance(p.id))));
  return c.json({ acceptances: rows.filter((r) => r !== null), total, next_offset });
});

// ----- Sections -----

api.post("/proposals/:id/sections", async (c) => {
  const p = await store.proposalById(idOf(c.req.param("id")));
  if (!p) return notFound(c, kinds.proposals);
  if (isLocked(p)) return locked(c, p);
  const b = await body(c);
  if (b instanceof Response) return b;
  const kind = rq.newSectionKind(b);
  if (!kind.ok) return problem(c, kind.problem);
  const shape = edit.newSection(kind.value);
  const change = rq.sectionBody(b, shape);
  if (!change.ok) return problem(c, change.problem);
  const sid = await store.addSection(p.id, shape);
  await store.updateSection(sid, edit.sectionFields(change.value.fields, shape));
  const section = (await store.sectionsFor(p.id)).find((x) => x.id === sid)!;
  if (change.value.items) await store.saveItems(sid, edit.items(change.value.items, section));
  else if (kind.value === "packages") await store.saveItems(sid, [{ ...edit.blankItem(true), name: "Essentials" }, { ...edit.blankItem(true), name: "Complete", recommended: true }]);
  else if (kind.value === "pricing") await store.saveItems(sid, [edit.blankItem(false)]);
  await store.refreshValue(p.id);
  return c.json({ section: rq.sectionJson((await store.sectionsFor(p.id)).find((x) => x.id === sid)!) }, 201);
});

const sectionNotFound = (c: Context) => fail(c, 404, "SECTION_NOT_FOUND", "No section has that id.", "GET /api/v1/proposals/:id lists its sections.");

// sectionFor loads a section and its proposal, refusing one whose proposal was decided.
const sectionFor = async (c: Context) => {
  const s = await store.sectionOf(idOf(c.req.param("id")));
  const p = s ? await store.proposalById(s.proposal_id) : undefined;
  if (!s || !p) return sectionNotFound(c);
  if (isLocked(p)) return locked(c, p);
  const section = (await store.sectionsFor(p.id)).find((x) => x.id === s.id);
  return section ? { section, p } : sectionNotFound(c);
};

api.patch("/sections/:id", async (c) => {
  const found = await sectionFor(c);
  if (found instanceof Response) return found;
  const { section, p } = found;
  const b = await body(c);
  if (b instanceof Response) return b;
  const change = rq.sectionBody(b, section);
  if (!change.ok) return problem(c, change.problem);
  const known = new Set(section.items.map((i) => i.id));
  const stranger = ((b.items as { id?: number }[] | undefined) ?? []).find((i) => i.id !== undefined && !known.has(i.id));
  if (stranger) return fail(c, 422, "ITEM_INVALID", `Item ${stranger.id} is not in this section.`, "Leave id out for a new item, or use an id from GET /api/v1/proposals/:id.");
  await store.updateSection(section.id, edit.sectionFields(change.value.fields, section));
  if (change.value.items) await store.saveItems(section.id, edit.items(change.value.items, section));
  await store.refreshValue(p.id);
  return c.json({ section: rq.sectionJson((await store.sectionsFor(p.id)).find((x) => x.id === section.id)!) });
});

api.post("/sections/:id/move", async (c) => {
  const found = await sectionFor(c);
  if (found instanceof Response) return found;
  const b = await body(c);
  if (b instanceof Response) return b;
  if (b.by !== -1 && b.by !== 1) return fail(c, 422, "MOVE_INVALID", "by must be -1 (up) or 1 (down).", 'Send {"by": -1}.');
  await store.moveSection(found.p.id, found.section.id, b.by);
  return c.json({ sections: (await store.sectionsFor(found.p.id)).map(rq.sectionJson) });
});

api.delete("/sections/:id", async (c) => {
  const found = await sectionFor(c);
  if (found instanceof Response) return found;
  await store.deleteSection(found.section.id);
  await store.refreshValue(found.p.id);
  return c.body(null, 204);
});

// ----- Price list -----

const priceJson = (i: store.PriceItem) => ({ id: i.id, name: i.name, description: i.description, unit_price_cents: i.unit_price, unit: i.unit, recurring: i.recurring });
const priceNotFound = (c: Context) => fail(c, 404, "PRICE_ITEM_NOT_FOUND", "No price list item has that id.", "GET /api/v1/price-items lists them.");

api.get("/price-items", async (c) => {
  const page = pageFrom(c);
  if (!page.ok) return problem(c, page.problem, 400);
  const { items, total, next_offset } = rq.paginate(await store.priceList(), page.value);
  return c.json({ price_items: items.map(priceJson), total, next_offset });
});

api.get("/price-items/:id", async (c) => {
  const i = await store.priceItem(idOf(c.req.param("id")));
  return i ? c.json({ price_item: priceJson(i) }) : priceNotFound(c);
});

const savePrice = async (c: Context, was?: store.PriceItem) => {
  const b = await body(c);
  if (b instanceof Response) return b;
  const f = rq.priceItemBody(b, was);
  if (!f.ok) return problem(c, f.problem);
  const row = edit.priceFields(f.value);
  if (!row) return fail(c, 422, "PRICE_ITEM_INVALID", "That price list item is not complete.", 'Send {"name": "…", "unit_price_cents": 180000}.');
  const id = await store.savePriceItem(was?.id ?? null, row);
  return c.json({ price_item: priceJson((await store.priceItem(id))!) }, was ? 200 : 201);
};

api.post("/price-items", (c) => savePrice(c));

api.patch("/price-items/:id", async (c) => {
  const was = await store.priceItem(idOf(c.req.param("id")));
  return was ? savePrice(c, was) : priceNotFound(c);
});

api.delete("/price-items/:id", async (c) => {
  const was = await store.priceItem(idOf(c.req.param("id")));
  if (!was) return priceNotFound(c);
  await store.deletePriceItem(was.id);
  return c.body(null, 204);
});

api.notFound((c) => fail(c, 404, "NOT_FOUND", "There is no such API endpoint.", "GET /api/v1 lists the endpoints."));

export const apiBase = () => `${baseUrl()}/api/v1`;
