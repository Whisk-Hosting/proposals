// The client's side, at /p/<token>. No sign-in: the unguessable token is the key. Every write
// here is a challenge route in whisk.yaml, so a bot has to do a proof of work first.
import type { Context, Hono } from "hono";
import { html } from "hono/html";
import { acceptedReceipt } from "../emails.js";
import { email } from "../events.js";
import { acceptProblems, freeze, fingerprint, isOpenToClient, strokesToPath, text, type Signature } from "../model.js";
import { missingChoices, normalise } from "../pricing.js";
import { pdfFor } from "../pdf.js";
import { alert, liveDoc, view, webhook } from "../proposals.js";
import * as store from "../store.js";
import { accentOf, docLayout } from "../views/layout.js";
import { proposalPage } from "../views/proposal.js";
import { clientLink, img } from "../web.js";

const fail = (c: Context, status: 400 | 404 | 409, code: string, message: string) => c.json({ error: { code, message } }, status);

const json = async (c: Context): Promise<Record<string, unknown>> => {
  const b = await c.req.json().catch(() => ({}));
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
};

const notReady = async (c: Context, status: 404 | 200, title: string) => {
  const s = await store.settings();
  return c.html(
    docLayout({ title, accent: accentOf(s), data: {}, body: html`<div class="closed" style="max-width:520px;margin:18vh auto 0"><h2>${title}</h2><p class="muted" style="margin:0">${s.business_name}</p></div>` }),
    status,
  );
};

// The client's IP address as the edge saw it (X-Forwarded-For, first entry).
const ipOf = (c: Context) => (c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "").split(",")[0].trim().slice(0, 64);

export const clientRoutes = (app: Hono) => {
  app.get("/p/:token", async (c) => {
    const p = await store.proposalByToken(c.req.param("token"));
    if (!p) return notReady(c, 404, "This link doesn't work");
    if (p.status === "draft") return notReady(c, 200, "This proposal isn't ready yet");
    const v = await view(p, new Date());
    const page = proposalPage({ ...v, questions: await store.questions(p.id), token: p.token, img, justAccepted: c.req.query("accepted") === "1" });
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    return c.html(page);
  });

  app.get("/p/:token/pdf", async (c) => {
    const p = await store.proposalByToken(c.req.param("token"));
    const a = p && p.status === "accepted" ? await store.acceptance(p.id) : undefined;
    if (!p || !a) return c.text("Not found", 404);
    const pdf = await pdfFor(a.frozen, a.fingerprint, clientLink(p.token));
    return c.body(new Uint8Array(pdf), 200, {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${p.title.replace(/[^\w .-]+/g, "").slice(0, 60) || "proposal"}.pdf"`,
      "cache-control": "private, max-age=3600",
    });
  });

  // A real view: the page's script calls this after it has been visible for two seconds, so
  // link previews in chat apps and mail scanners don't count.
  app.post("/p/:token/viewed", async (c) => {
    const p = await store.proposalByToken(c.req.param("token"));
    if (!p || !isOpenToClient(p, new Date())) return c.json({ ok: true });
    if (await store.recordView(p.id)) {
      await store.log(p.id, "viewed", p.client_name || "Client", "Opened for the first time");
      await alert(p, { kind: "viewed", who: p.client_name || "Your client", detail: "" });
      await webhook("proposal.viewed", p);
    }
    return c.json({ ok: true });
  });

  app.post("/p/:token/questions", async (c) => {
    const p = await store.proposalByToken(c.req.param("token"));
    if (!p || !isOpenToClient(p, new Date())) return fail(c, 404, "NOT_OPEN", "This proposal isn't taking questions.");
    const b = await json(c);
    const body = text(b.body, 2000);
    if (body.length < 2) return fail(c, 400, "QUESTION_EMPTY", "Type your question.");
    const open = (await store.questions(p.id)).filter((q) => !q.answer).length;
    if (open >= 20) return fail(c, 409, "TOO_MANY_QUESTIONS", "There are already 20 questions waiting. We'll answer those first.");
    const name = text(b.name, 120) || p.client_name;
    await store.ask(p.id, { asked_by: name, asked_email: text(b.email, 254), body });
    await store.log(p.id, "question", name || "Client", body);
    await alert(p, { kind: "question", who: name || "Your client", detail: body });
    return c.json({ ok: true }, 201);
  });

  app.post("/p/:token/accept", async (c) => {
    const p = await store.proposalByToken(c.req.param("token"));
    if (!p) return fail(c, 404, "NOT_FOUND", "This link doesn't work.");
    if (!isOpenToClient(p, new Date())) return fail(c, 409, "NOT_OPEN", "This proposal can no longer be accepted.");
    const b = await json(c);
    const sig = (b.signature ?? {}) as { kind?: string; text?: unknown; strokes?: unknown };
    const signature: Signature | undefined =
      sig.kind === "drawn" ? ((path) => (path ? { kind: "drawn" as const, path } : undefined))(strokesToPath(sig.strokes)) : sig.kind === "typed" ? { kind: "typed", text: text(sig.text, 120) } : undefined;
    const form = { name: text(b.name, 120), email: text(b.email, 254).toLowerCase(), signature };
    const problems = acceptProblems(form);
    if (problems.length > 0) return fail(c, 400, "ACCEPT_INCOMPLETE", problems.join(" "));
    const doc = await liveDoc(p);
    const selections = normalise(doc.sections, b.selections);
    const missing = missingChoices(doc.sections, selections);
    if (missing.length > 0) return fail(c, 400, "CHOICE_MISSING", `Choose one option in "${missing[0].heading || "the packages"}".`);
    const frozen = freeze(doc, selections, {
      name: form.name,
      email: form.email,
      signature: signature!,
      ip: ipOf(c),
      user_agent: (c.req.header("user-agent") ?? "").slice(0, 300),
      accepted_at: new Date().toISOString(),
    });
    const fp = fingerprint(frozen);
    if (!(await store.accept(p.id, frozen, fp))) return fail(c, 409, "NOT_OPEN", "This proposal can no longer be accepted.");
    const total = frozen.quote.once.total;
    await store.log(p.id, "accepted", form.name, "");
    const s = await store.settings();
    await email("receipt", acceptedReceipt(s, p, form.email, form.name, clientLink(p.token)));
    await alert(p, { kind: "accepted", who: form.name, detail: "" });
    await webhook("proposal.accepted", p, { accepted_by: { name: form.name, email: form.email }, total_cents: total, monthly_cents: frozen.quote.month.total, lines: frozen.quote.lines, fingerprint: fp });
    return c.json({ ok: true });
  });

  app.post("/p/:token/decline", async (c) => {
    const p = await store.proposalByToken(c.req.param("token"));
    if (!p || !isOpenToClient(p, new Date())) return fail(c, 409, "NOT_OPEN", "This proposal can no longer be declined.");
    const reason = text((await json(c)).reason, 1000);
    if (!(await store.decline(p.id, reason))) return fail(c, 409, "NOT_OPEN", "This proposal can no longer be declined.");
    await store.log(p.id, "declined", p.client_name || "Client", reason);
    await alert(p, { kind: "declined", who: p.client_name || "Your client", detail: reason });
    await webhook("proposal.declined", p, { reason });
    return c.json({ ok: true });
  });
};
