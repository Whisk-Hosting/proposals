// The business's side: writing proposals, sending them, answering questions, the price list and
// settings. index.ts lets only the team in; settings also need an owner or admin.
import type { Context, Hono } from "hono";
import { randomBytes } from "node:crypto";
import * as edit from "../editing.js";
import { answerEmail, followUpEmail, proposalEmail, testEmail } from "../emails.js";
import { isDemo } from "../demo.js";
import { email, emit } from "../events.js";
import { addDays, csv, dayIn, isEmail, isLocked, isPublicUrl, shownStatus, slugify, statusLabel, text, type Proposal } from "../model.js";
import { view, webhook } from "../proposals.js";
import * as store from "../store.js";
import { message } from "../views/parts.js";
import { proposalPage } from "../views/proposal.js";
import * as views from "../views/staff.js";
import { actor, baseUrl, clientLink, flash, idParam, img, notFound, posInt, render, who } from "../web.js";
import { canAdmin, log, whiskApi } from "../whisk.js";

// fields reads a form with every value of a repeated field, leaving out files.
const fields = async (c: Context): Promise<edit.Fields> => {
  const body = await c.req.parseBody({ all: true });
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? v : ""]),
  );
};

// Autosaving forms send x-autosave and want only a yes or no back; a plain submit comes back
// to the page.
const isAutosave = (c: Context) => c.req.header("x-autosave") === "1";
const saved = (c: Context, to: string) => (isAutosave(c) ? c.body(null, 204) : c.redirect(to, 303));

const owner = (c: Context) => {
  const id = who(c);
  return { email: id.email ?? "", name: actor(id) };
};
const ownerFields = (c: Context) => ((o) => ({ owner_email: o.email, owner_name: o.name }))(owner(c));

const today = () => dayIn(new Date());

// Each route that changes one proposal loads it first, and refuses changes to one that is
// accepted or declined: what was agreed stays as agreed.
const editable = async (c: Context, id: number): Promise<Proposal | Response> => {
  const p = await store.proposalById(id);
  if (!p) return isAutosave(c) ? c.json({ error: { code: "NOT_FOUND", message: "That proposal no longer exists." } }, 404) : notFound(c, "proposal");
  if (isLocked(p)) return isAutosave(c) ? c.json({ error: { code: "LOCKED", message: "This proposal has been decided and can't change." } }, 409) : c.redirect(`/proposals/${p.id}`, 303);
  return p;
};

const back = (p: Pick<Proposal, "id">, ok?: string, anchor = "") => `/proposals/${p.id}${ok ? `?ok=${ok}` : ""}${anchor}`;

// ----- Uploads -----

// An upload is two calls to the same address: the first asks Whisk for a one-off upload address
// (the browser then sends the picture straight to storage), the second saves the upload's id.
// Pictures in proposals are public, because clients open them without signing in.
type UploadBody = { filename?: unknown; content_type?: unknown; size?: unknown; upload_id?: unknown };

const upload = async (c: Context, save: (uploadId: string) => Promise<unknown>) => {
  if (isDemo()) return c.json({ error: { code: "DEMO", message: "Pictures can't be added in the demo." } }, 400);
  const b = (await c.req.json().catch(() => ({}))) as UploadBody;
  if (b.upload_id !== undefined) {
    const uploadId = text(b.upload_id, 80);
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(uploadId)) return c.json({ error: { code: "UPLOAD_INVALID", message: "That upload id is not valid." } }, 400);
    await save(uploadId);
    return c.json({ ok: true });
  }
  const type = text(b.content_type, 100);
  if (!/^image\//.test(type)) return c.json({ error: { code: "NOT_AN_IMAGE", message: "Choose a picture." } }, 400);
  const size = Number(b.size);
  if (!Number.isFinite(size) || size <= 0 || size > 25 * 1024 ** 2) return c.json({ error: { code: "TOO_LARGE", message: "The picture must be smaller than 25 MB." } }, 400);
  try {
    const up = await whiskApi<{ id: string; url: string; fields: Record<string, string> }>("/uploads", {
      filename: text(b.filename, 200) || "picture",
      content_type: type,
      max_bytes: Math.ceil(size),
      visibility: "public",
    });
    return c.json({ id: up.id, url: up.url, fields: up.fields });
  } catch (err) {
    log.warn({ request_id: who(c).requestId, err: String(err) }, "upload not authorised");
    return c.json({ error: { code: "UPLOAD_UNAVAILABLE", message: "Whisk could not start the upload. Try again in a minute." } }, 502);
  }
};

export const staffRoutes = (app: Hono) => {
  // ----- Home -----

  app.get("/", async (c) => {
    const now = new Date();
    const all = await store.proposals(false);
    const show = views.filters.find((f) => f.key === c.req.query("show")) ?? views.filters[0];
    const list = all.filter((p) => show.test(shownStatus(p, now)));
    const [s, feed] = await Promise.all([store.settings(), store.recentActivity(8)]);
    return render(c, "Proposals", views.home({ list, all, filter: show.key, feed, currency: s.currency, now, flash: flash(c) }), { tab: "proposals" });
  });

  // ----- New proposals -----

  const starter = async (id: number) => {
    await store.addSection(id, { kind: "text", heading: "The project", body: "", pick_one: false });
    await store.addSection(id, edit.newSection("pricing"));
  };

  app.post("/proposals/new", async (c) => {
    const s = await store.settings();
    const id = await store.createProposal({ ...edit.blankProposal(s, today(), addDays), ...ownerFields(c) });
    await starter(id);
    await store.log(id, "created", actor(who(c)));
    return c.redirect(`/proposals/${id}`, 303);
  });

  app.post("/templates/:id/use", async (c) => {
    const t = await store.proposalById(idParam(c));
    if (!t) return notFound(c, "template");
    const id = await store.duplicate(t.id, false, owner(c));
    if (!id) return notFound(c, "template");
    const s = await store.settings();
    await store.updateProposal(id, { expires_on: addDays(today(), s.valid_days) });
    await store.log(id, "created", actor(who(c)), `From the template ${t.title}`);
    return c.redirect(`/proposals/${id}`, 303);
  });

  // ----- The editor -----

  app.get("/proposals/:id", async (c) => {
    const p = await store.proposalById(idParam(c));
    if (!p) return notFound(c, "proposal");
    const [sections, activity, questions, prices, accepted] = await Promise.all([
      store.sectionsFor(p.id),
      store.activity(p.id),
      store.questions(p.id),
      store.priceList(),
      p.status === "accepted" ? store.acceptance(p.id) : Promise.resolve(undefined),
    ]);
    return render(c, p.title, views.editor({ p, sections, activity, questions, prices, link: clientLink(p.token), now: new Date(), flash: flash(c), accepted, img }), {
      tab: p.is_template ? "templates" : "proposals",
    });
  });

  app.post("/proposals/:id", async (c) => {
    const p = await editable(c, idParam(c));
    if (p instanceof Response) return p;
    const f = await fields(c);
    await store.updateProposal(p.id, { ...edit.proposalFields(f, p), ...(edit.one(f, "cover") === "remove" ? { cover_upload_id: null } : {}) });
    await store.refreshValue(p.id);
    return saved(c, back(p));
  });

  app.post("/proposals/:id/cover", async (c) => {
    const p = await editable(c, idParam(c));
    if (p instanceof Response) return p;
    return upload(c, (uploadId) => store.updateProposal(p.id, { cover_upload_id: uploadId }));
  });

  app.post("/proposals/:id/sections", async (c) => {
    const p = await editable(c, idParam(c));
    if (p instanceof Response) return p;
    const kind = edit.one(await fields(c), "kind");
    if (!edit.isNewKind(kind)) return c.redirect(back(p), 303);
    const sid = await store.addSection(p.id, edit.newSection(kind));
    if (kind === "packages") await store.saveItems(sid, [{ ...edit.blankItem(true), name: "Essentials" }, { ...edit.blankItem(true), name: "Complete", recommended: true }]);
    if (kind === "pricing") await store.saveItems(sid, [edit.blankItem(false)]);
    await store.updateProposal(p.id, {});
    return c.redirect(back(p, undefined, `#s${sid}`), 303);
  });

  // A section's routes find its proposal through the section.
  const sectionAndProposal = async (c: Context) => {
    const s = await store.sectionOf(idParam(c));
    if (!s) return isAutosave(c) ? c.json({ error: { code: "NOT_FOUND", message: "That section no longer exists." } }, 404) : notFound(c, "section");
    const p = await editable(c, s.proposal_id);
    return p instanceof Response ? p : { s, p };
  };

  app.post("/sections/:id", async (c) => {
    const found = await sectionAndProposal(c);
    if (found instanceof Response) return found;
    const { s, p } = found;
    const f = await fields(c);
    await store.updateSection(s.id, edit.sectionFields(f, s));
    if (s.kind === "pricing") {
      const section = (await store.sectionsFor(p.id)).find((x) => x.id === s.id);
      const fromList = edit.one(f, "add") === "list" ? await store.priceItem(posInt(edit.one(f, "from_list"))) : undefined;
      if (section) await store.saveItems(s.id, edit.items(f, section, fromList));
    }
    await store.refreshValue(p.id);
    const structural = edit.one(f, "add") !== undefined || edit.one(f, "remove") !== undefined;
    return structural ? c.redirect(back(p, undefined, `#s${s.id}`), 303) : saved(c, back(p, undefined, `#s${s.id}`));
  });

  app.post("/sections/:id/move", async (c) => {
    const found = await sectionAndProposal(c);
    if (found instanceof Response) return found;
    const by = edit.one(await fields(c), "by") === "-1" ? -1 : 1;
    await store.moveSection(found.p.id, found.s.id, by);
    return c.redirect(back(found.p, undefined, `#s${found.s.id}`), 303);
  });

  app.post("/sections/:id/delete", async (c) => {
    const found = await sectionAndProposal(c);
    if (found instanceof Response) return found;
    await store.deleteSection(found.s.id);
    await store.refreshValue(found.p.id);
    return c.redirect(back(found.p), 303);
  });

  app.post("/sections/:id/image", async (c) => {
    const found = await sectionAndProposal(c);
    if (found instanceof Response) return found;
    return upload(c, (uploadId) => store.updateSection(found.s.id, { image_upload_id: uploadId }));
  });

  app.get("/proposals/:id/preview", async (c) => {
    const p = await store.proposalById(idParam(c));
    if (!p) return notFound(c, "proposal");
    const v = await view(p, new Date(), true);
    c.header("Cache-Control", "no-store");
    return c.html(proposalPage({ ...v, questions: [], token: p.token, img, justAccepted: false }));
  });

  // ----- Sending and following up -----

  app.get("/proposals/:id/send", async (c) => {
    const p = await editable(c, idParam(c));
    if (p instanceof Response) return p;
    if (p.is_template) return c.redirect(back(p), 303);
    return render(c, "Send", views.sendPage(p, clientLink(p.token)));
  });

  app.post("/proposals/:id/send", async (c) => {
    const p = await editable(c, idParam(c));
    if (p instanceof Response) return p;
    if (p.is_template) return c.redirect(back(p), 303);
    const f = await fields(c);
    const name = text(edit.one(f, "client_name"), 120);
    const to = text(edit.one(f, "client_email"), 254).toLowerCase();
    const byEmail = edit.one(f, "how") !== "link";
    const next = { ...p, client_name: name, client_email: to };
    if (byEmail && !isEmail(to)) return render(c, "Send", views.sendPage(next, clientLink(p.token), "Enter the client's email address."), { status: 400 });
    if (to && !isEmail(to)) return render(c, "Send", views.sendPage(next, clientLink(p.token), "That email address doesn't look right."), { status: 400 });
    await store.updateProposal(p.id, { client_name: name, client_email: to });
    await store.markSent(p.id);
    const by = owner(c);
    await store.log(p.id, "sent", by.name, byEmail ? `Emailed to ${to}` : "Link copied");
    const s = await store.settings();
    if (byEmail) await email("proposal", proposalEmail(s, next, clientLink(p.token), text(edit.one(f, "note"), 4000), by.email || p.owner_email));
    const sent = (await store.proposalById(p.id))!;
    await webhook("proposal.sent", sent);
    return c.redirect(back(p, byEmail ? "sent" : "marked"), 303);
  });

  app.post("/proposals/:id/follow-up", async (c) => {
    const p = await editable(c, idParam(c));
    if (p instanceof Response) return p;
    if (p.status !== "sent" || !isEmail(p.client_email)) return c.redirect(back(p), 303);
    const by = owner(c);
    const note = text(edit.one(await fields(c), "note"), 2000);
    await email("follow_up", followUpEmail(await store.settings(), p, clientLink(p.token), note, by.email || p.owner_email));
    await store.markFollowedUp(p.id);
    await store.log(p.id, "follow_up", by.name, note);
    return c.redirect(back(p, "followed"), 303);
  });

  app.post("/proposals/:id/draft", async (c) => {
    const p = await editable(c, idParam(c));
    if (p instanceof Response) return p;
    await store.backToDraft(p.id);
    await store.log(p.id, "draft", actor(who(c)));
    return c.redirect(back(p, "draft"), 303);
  });

  app.post("/proposals/:id/questions/:qid", async (c) => {
    const p = await editable(c, idParam(c));
    if (p instanceof Response) return p;
    const body = text(edit.one(await fields(c), "answer"), 2000);
    if (!body) return c.redirect(back(p, undefined, "#questions"), 303);
    const by = actor(who(c));
    const q = await store.answer(p.id, idParam(c, "qid"), body, by);
    if (!q) return c.redirect(back(p, undefined, "#questions"), 303);
    await store.log(p.id, "answer", by, body);
    const to = q.asked_email || p.client_email;
    if (isEmail(to)) await email("answer", answerEmail(await store.settings(), p, to, clientLink(p.token), { body: q.body, answer: body, by }));
    return c.redirect(back(p, "answered", "#questions"), 303);
  });

  // ----- Copies, templates and deleting -----

  app.post("/proposals/:id/duplicate", async (c) => {
    const p = await store.proposalById(idParam(c));
    if (!p) return notFound(c, "proposal");
    const id = await store.duplicate(p.id, p.is_template, owner(c), `${p.title} (copy)`);
    if (!id) return notFound(c, "proposal");
    if (!p.is_template) await store.updateProposal(id, { expires_on: addDays(today(), (await store.settings()).valid_days) });
    await store.log(id, "created", actor(who(c)), `Copied from ${p.title}`);
    return c.redirect(`/proposals/${id}?ok=copied`, 303);
  });

  app.post("/proposals/:id/template", async (c) => {
    const p = await store.proposalById(idParam(c));
    if (!p) return notFound(c, "proposal");
    const id = await store.duplicate(p.id, true, owner(c));
    return c.redirect(id ? `/proposals/${id}?ok=template` : "/templates", 303);
  });

  app.post("/proposals/:id/delete", async (c) => {
    const p = await store.proposalById(idParam(c));
    if (!p) return notFound(c, "proposal");
    await store.deleteProposal(p.id);
    return c.redirect(p.is_template ? "/templates?ok=deleted" : "/?ok=deleted", 303);
  });

  app.get("/templates", async (c) => render(c, "Templates", views.templatesPage(await store.proposals(true), flash(c)), { tab: "templates" }));

  // ----- Price list -----

  app.get("/prices", async (c) => {
    const [items, s] = await Promise.all([store.priceList(), store.settings()]);
    const editing = items.find((i) => i.id === posInt(c.req.query("edit")));
    return render(c, "Price list", views.pricesPage(items, s.currency, editing, flash(c)), { tab: "prices" });
  });

  const savePrice = async (c: Context, id: number | null) => {
    const f = edit.priceFields(await fields(c));
    if (f) await store.savePriceItem(id, f);
    return c.redirect(f ? "/prices?ok=saved" : "/prices", 303);
  };
  app.post("/prices", (c) => savePrice(c, null));
  app.post("/prices/:id", (c) => savePrice(c, idParam(c) || null));
  app.post("/prices/:id/delete", async (c) => {
    await store.deletePriceItem(idParam(c));
    return c.redirect("/prices?ok=deleted", 303);
  });

  // ----- Settings: owners and admins -----

  const adminOnly = async (c: Context, next: () => Promise<void>) => {
    if (!canAdmin(who(c))) return render(c, "Not allowed", message("Settings are for owners and admins", ""), { status: 403 });
    await next();
  };
  app.use("/settings", adminOnly);
  app.use("/settings/*", adminOnly);
  app.use("/export.csv", adminOnly);

  const settingsView = async (c: Context, error?: string, newKey?: string) => {
    const [s, emails, deliveries, keys] = await Promise.all([store.settings(), store.recentEmails(12), store.recentDeliveries(12), store.apiKeys()]);
    const api = { keys, base: `${baseUrl()}/api/v1`, newKey };
    return render(c, "Settings", views.settingsPage({ s, emails, deliveries, api, logoUrl: s.logo_upload_id ? img(s.logo_upload_id, 200) : null, demo: isDemo(), flash: flash(c), error, now: new Date() }), {
      tab: "settings",
      status: error ? 400 : 200,
    });
  };

  app.get("/settings", (c) => settingsView(c));

  app.post("/settings", async (c) => {
    const s = await store.settings();
    const f = await fields(c);
    const next = edit.settingsFields(f, s, isDemo());
    if (next.email_from && !isEmail(next.email_from)) return settingsView(c, "The from address doesn't look like an email address.");
    if (next.notify_email && !isEmail(next.notify_email)) return settingsView(c, "The alerts address doesn't look like an email address.");
    if (next.webhook_url && !isPublicUrl(next.webhook_url)) return settingsView(c, "The webhook URL must start with https:// and name a public website.");
    const secret = next.webhook_url && !s.webhook_secret ? { webhook_secret: `whsec_${randomBytes(24).toString("base64url")}` } : {};
    await store.saveSettings({ ...next, ...secret, ...(edit.one(f, "logo") === "remove" ? { logo_upload_id: null } : {}) });
    return c.redirect("/settings?ok=saved", 303);
  });

  // API keys: the key is shown on this response only; only its hash is kept.
  app.post("/settings/keys", async (c) => {
    const label = text(edit.one(await fields(c), "label"), 80);
    if (!label) return settingsView(c, "Give the key a name, like the system that will use it.");
    const id = who(c);
    const key = await store.createKey(label, id.email || actor(id));
    log.info({ request_id: id.requestId, key: label }, "API key made");
    return settingsView(c, undefined, key);
  });

  app.post("/settings/keys/:id/revoke", async (c) => {
    const k = await store.revokeKey(idParam(c));
    if (k) log.info({ request_id: who(c).requestId, key: k.label }, "API key turned off");
    return c.redirect("/settings?ok=key_off#api", 303);
  });

  app.post("/settings/logo", (c) => upload(c, (uploadId) => store.saveSettings({ logo_upload_id: uploadId })));

  app.post("/settings/webhook-test", async (c) => {
    await emit("ping", { message: "A test from your proposals app." });
    return c.redirect("/settings?ok=test", 303);
  });

  app.post("/settings/email-test", async (c) => {
    const to = who(c).email ?? "";
    if (isEmail(to)) await email("test", testEmail(await store.settings(), to));
    return c.redirect("/settings?ok=test", 303);
  });

  // Every proposal as a spreadsheet: what was proposed, to whom, and what happened.
  app.get("/export.csv", async (c) => {
    const now = new Date();
    const ps = await store.proposals(false);
    const body = csv(
      ["id", "title", "client", "company", "email", "status", "value", "currency", "sent", "first_opened", "views", "decided", "valid_until", "link"],
      ps.map((p) => [p.id, p.title, p.client_name, p.client_company, p.client_email, statusLabel[shownStatus(p, now)], (p.value_cents / 100).toFixed(2), p.currency, p.sent_at ?? "", p.first_viewed_at ?? "", p.view_count, p.decided_at ?? "", p.expires_on ?? "", clientLink(p.token)]),
    );
    return c.body(body, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slugify("proposals " + today())}.csv"` });
  });
};
