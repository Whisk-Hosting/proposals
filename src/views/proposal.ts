// The proposal as the client sees it at /p/<token>: a cover, the sections, pricing they can
// change, the totals, questions, and accepting. The page works out its totals with the same
// pricing.ts the server uses (assets/proposal.js); the server draws the first state, so the page
// reads right before any script runs.
import { html, raw } from "hono/html";
import { markdown } from "../markdown.js";
import { prettyDay, prettyTime, type Frozen, type ProposalDoc } from "../model.js";
import { headline, isIncluded, lineMeta, money, per, qtyFor, type Item, type Quote, type Section, type Selections, type Terms } from "../pricing.js";
import type { Question } from "../store.js";
import { accentOf, brandMark, docLayout } from "./layout.js";
import { icon } from "./icons.js";
import { artStyle } from "./parts.js";

export type DocState =
  | { kind: "open" }
  | { kind: "preview" }
  | { kind: "accepted"; frozen: Frozen; fingerprint: string }
  | { kind: "declined"; reason: string; at: Date | null }
  | { kind: "expired" }
  | { kind: "draft" };

type Page = {
  doc: ProposalDoc;
  state: DocState;
  selections: Selections;
  quote: Quote;
  questions: Question[];
  token: string;
  img: (id: string, w: number) => string;
  justAccepted?: boolean;
};

const stepper = (item: Item, qty: number, locked: boolean) => html`<div class="ctl">
  <div class="stepper">
    <button type="button" data-step="-1" aria-label="Fewer"${locked ? " disabled" : ""}>−</button>
    <input type="number" inputmode="numeric" data-qty="${item.id}" value="${qty}" min="${item.qty_min}" max="${item.qty_max}" aria-label="How many ${item.name}"${locked ? " disabled" : ""}>
    <button type="button" data-step="1" aria-label="More"${locked ? " disabled" : ""}>+</button>
  </div><span class="u">${item.unit || ""}</span>
</div>`;

const line = (s: Section, item: Item, sel: Selections, terms: Terms, locked: boolean) => {
  const on = isIncluded(s, item, sel);
  const qty = qtyFor(item, sel);
  const optional = item.mode === "optional";
  return html`<div class="line${on ? "" : " off"}" data-line="${item.id}">
  <div class="lead">${optional
    ? html`<label class="toggle"><input type="checkbox" data-opt="${item.id}"${on ? " checked" : ""}${locked ? " disabled" : ""} aria-label="Include ${item.name}"><i></i></label>`
    : icon.check}</div>
  <div class="name">${item.name}${item.recommended ? html` <span class="badge accent">Recommended</span>` : ""}</div>
  <div class="price"><span data-amount="${item.id}">${money(item.unit_price * qty, terms.currency)}</span><small data-meta="${item.id}">${lineMeta(item, qty, terms.currency)}</small></div>
  ${item.description ? html`<div class="desc">${item.description}</div>` : ""}
  ${item.qty_editable ? stepper(item, qty, locked) : ""}
</div>`;
};

const pkg = (s: Section, item: Item, sel: Selections, terms: Terms, locked: boolean) => {
  const on = sel.picks[String(s.id)] === item.id;
  const unit = per(item);
  return html`<label class="pkg">
  <input type="radio" name="pick-${s.id}" value="${item.id}" data-pick="${s.id}"${on ? " checked" : ""}${locked ? " disabled" : ""}>
  ${item.recommended ? html`<span class="badge accent rec">${icon.sparkle} Recommended</span>` : ""}
  <span class="nm">${item.name}<span class="radio">${icon.check}</span></span>
  <span class="pr">${money(item.unit_price * item.quantity, terms.currency)}${unit ? html` <small>/ ${unit}</small>` : ""}</span>
  ${item.description ? html`<span class="ds">${item.description}</span>` : ""}
</label>`;
};

const pricingBody = (s: Section, sel: Selections, terms: Terms, locked: boolean) =>
  s.pick_one
    ? html`<div class="packages" role="radiogroup" aria-label="${s.heading || "Choose one"}">${s.items.map((i) => pkg(s, i, sel, terms, locked))}</div>`
    : html`<div class="lines">${s.items.map((i) => line(s, i, sel, terms, locked))}</div>`;

const section = (s: Section, n: number, sel: Selections, terms: Terms, locked: boolean, img: Page["img"]) => {
  const kicker = html`<div class="kicker">${String(n).padStart(2, "0")}</div>`;
  if (s.kind === "image")
    return s.image_upload_id
      ? html`<section class="doc-sec">${s.heading ? html`${kicker}<h2>${s.heading}</h2>` : ""}<figure class="doc-img"><img src="${img(s.image_upload_id, 1600)}" srcset="${img(s.image_upload_id, 800)} 800w, ${img(s.image_upload_id, 1600)} 1600w" sizes="(max-width: 800px) 100vw, 780px" alt="${s.heading}" loading="lazy"></figure>${s.body ? html`<p class="lede" style="margin-top:12px">${s.body}</p>` : ""}</section>`
      : "";
  if (s.kind === "pricing")
    return html`<section class="doc-sec">${kicker}${s.heading ? html`<h2>${s.heading}</h2>` : ""}${s.body ? html`<p class="lede">${s.body}</p>` : ""}${pricingBody(s, sel, terms, locked)}</section>`;
  return html`<section class="doc-sec">${kicker}${s.heading ? html`<h2>${s.heading}</h2>` : ""}<div class="prose">${raw(markdown(s.body))}</div></section>`;
};

const row = (label: string, value: string, key: string, cls = "") => html`<div class="row2 ${cls}"><span>${label}</span><span data-t="${key}">${value}</span></div>`;

// The totals card. Rows the proposal doesn't need (no discount, no monthly items) stay in the
// page but hidden, so the script can show them as the client changes things.
export const summary = (q: Quote, t: Terms) => {
  const m = (c: number) => money(c, t.currency);
  const hasMonth = q.month.subtotal > 0;
  const hasOnce = q.once.subtotal > 0 || !hasMonth;
  const discount = `Discount ${t.discount_bp / 100}%`;
  const tax = t.tax_mode === "exclusive" ? `Tax ${t.gst_rate_bp / 100}%` : `Includes tax`;
  const block = (k: "once" | "month", heading: string, show: boolean) => html`<div data-block="${k}"${show ? "" : raw(' class="hidden"')}>
  <h3>${heading}</h3>
  ${row("Subtotal", m(q[k].subtotal), `${k}.subtotal`)}
  ${t.discount_bp > 0 ? row(discount, `−${m(q[k].discount)}`, `${k}.discount`) : ""}
  ${t.tax_mode !== "none" ? row(tax, m(q[k].tax), `${k}.tax`) : ""}
  ${row(k === "once" ? "Total" : "Each month", m(q[k].total), `${k}.total`, "sub-total")}
</div>`;
  return html`<div class="summary" aria-live="polite">
  ${block("once", "One-off", hasOnce)}
  ${block("month", "Monthly", hasMonth)}
  <div class="row2 total"><span>${hasOnce ? "Total" : "Each month"}</span><b data-t="headline">${m(hasOnce ? q.once.total : q.month.total)}</b></div>
  ${t.deposit_bp > 0 ? html`<div class="deposit"><span>Deposit ${t.deposit_bp / 100}%</span><span data-t="deposit">${m(q.deposit)}</span></div>` : ""}
</div>`;
};

const questionsBlock = (qs: Question[], open: boolean, n: number) =>
  qs.length === 0 && !open
    ? ""
    : html`<section class="doc-sec" id="questions">
  <div class="kicker">${String(n).padStart(2, "0")}</div>
  <h2>Questions</h2>
  <div class="qa">
    ${qs.map((q) => html`<div class="q">
      <div class="who">${q.asked_by || "You"} · ${prettyTime(q.asked_at)}</div>
      <p>${q.body}</p>
      ${q.answer ? html`<div class="a"><div class="who">${q.answered_by}</div><p>${q.answer}</p></div>` : html`<div class="pending">Waiting for an answer</div>`}
    </div>`)}
    ${open
      ? html`<form class="ask" data-ask>
      <textarea name="body" rows="3" maxlength="2000" placeholder="Ask a question" required aria-label="Your question"></textarea>
      <div class="grid-2"><input type="text" name="name" maxlength="120" placeholder="Your name" aria-label="Your name" autocomplete="name"><input type="email" name="email" maxlength="254" placeholder="Your email" aria-label="Your email" autocomplete="email"></div>
      <div class="row"><button class="btn" type="submit">${icon.chat} Ask</button><span class="err" role="alert"></span></div>
    </form>`
      : ""}
  </div>
</section>`;

const signature = (f: Frozen) =>
  f.acceptance.signature.kind === "typed"
    ? html`<div class="sig">${f.acceptance.signature.text}</div>`
    : html`<div class="sig"><svg viewBox="0 0 1000 300" role="img" aria-label="Signature of ${f.acceptance.name}"><path d="${f.acceptance.signature.path}"/></svg></div>`;

const decidedBlock = (state: DocState, token: string) => {
  if (state.kind === "accepted") {
    const a = state.frozen.acceptance;
    return html`<div class="decided" id="accepted" style="margin-top:72px">
  <div class="head"><span class="seal">${icon.check}</span><div><h2>Accepted</h2><div class="muted small">${a.name} · ${prettyTime(a.accepted_at)}</div></div></div>
  ${signature(state.frozen)}
  <div class="row"><a class="btn primary" href="/p/${token}/pdf">${icon.download} Download PDF</a></div>
  <div class="fp" title="SHA-256 of everything accepted">${state.fingerprint}</div>
</div>`;
  }
  if (state.kind === "declined")
    return html`<div class="decided" style="margin-top:72px"><div class="head"><span class="seal bad">${icon.x}</span><div><h2>Declined</h2>${state.at ? html`<div class="muted small">${prettyTime(state.at)}</div>` : ""}</div></div>${state.reason ? html`<p class="muted" style="margin:0">${state.reason}</p>` : ""}</div>`;
  if (state.kind === "expired") return html`<div class="closed"><h2>This proposal has expired</h2><p class="muted" style="margin:0">Ask us for a new one.</p></div>`;
  return "";
};

const acceptDialog = (doc: ProposalDoc) => html`<dialog class="sheet" id="accept">
  <form data-accept novalidate>
    <button class="icon-btn close" type="button" data-close aria-label="Close">${icon.x}</button>
    <h2>Accept proposal</h2>
    <p class="tot" data-t="dialog"></p>
    <div class="field"><label for="a-name">Full name</label><input id="a-name" name="name" type="text" maxlength="120" autocomplete="name" value="${doc.proposal.client_name}" required></div>
    <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" maxlength="254" autocomplete="email" required></div>
    <div class="field">
      <div class="sig-tabs"><span class="label">Signature</span>
        <span class="segmented"><label><input type="radio" name="sigkind" value="typed" checked><span>Type</span></label><label><input type="radio" name="sigkind" value="drawn"><span>Draw</span></label></span>
      </div>
      <div class="sigpad"><canvas aria-label="Sign here" hidden></canvas><div class="typed" data-typed></div><span class="x">×</span><span class="base"></span></div>
      <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="link small" type="button" data-clear hidden>Clear</button></div>
    </div>
    <button class="btn primary big block" type="submit">${icon.sign} Accept and sign</button>
    <p class="err" role="alert"></p>
  </form>
</dialog>
<dialog class="sheet" id="decline">
  <form data-decline>
    <button class="icon-btn close" type="button" data-close aria-label="Close">${icon.x}</button>
    <h2>Decline</h2>
    <div class="field"><label for="d-reason">Reason</label><textarea id="d-reason" name="reason" maxlength="1000" rows="3"></textarea></div>
    <button class="btn danger block" type="submit">Decline proposal</button>
    <p class="err" role="alert"></p>
  </form>
</dialog>`;

export const proposalPage = (p: Page) => {
  const { doc, state, selections: sel, quote: q } = p;
  const t = doc.proposal;
  const accent = accentOf(doc.brand);
  const open = state.kind === "open" || state.kind === "preview";
  const locked = !open;
  const h = headline(q, t);
  const cover = t.cover_upload_id ? p.img(t.cover_upload_id, 2000) : null;
  const visible = doc.sections.filter((s) => s.kind !== "image" || s.image_upload_id);
  const forWho = t.client_company || t.client_name;
  const n = visible.length;
  const body = html`
${state.kind === "preview" ? html`<div class="demo-bar" style="position:relative;z-index:6"><div class="wrap"><span>Preview · views aren't counted</span><a href="/proposals/${t.id}" style="color:inherit">Back to editing</a></div></div>` : ""}
<header class="doc-top"><div class="wrap">
  <span class="brand">${doc.brand.logo_upload_id ? html`<img src="${p.img(doc.brand.logo_upload_id, 160)}" alt="">` : brandMark(doc.brand)}<span>${doc.brand.business_name}</span></span>
  ${state.kind === "accepted" ? html`<a class="btn small" href="/p/${p.token}/pdf">${icon.download} PDF</a>` : ""}
</div></header>
<section class="cover">
  <div class="art${cover ? " img" : " grain"}" style="${artStyle(cover)}"></div>
  ${cover ? "" : html`<div class="rings"></div>`}
  <div class="in">
    ${forWho ? html`<div class="for">${icon.doc} Proposal for ${forWho}</div>` : ""}
    <h1>${t.title}</h1>
    ${t.subtitle ? html`<p class="sub">${t.subtitle}</p>` : ""}
    <div class="meta">
      ${t.owner_name ? html`<span>${icon.user} ${t.owner_name}</span>` : ""}
      ${t.expires_on && open ? html`<span>${icon.calendar} Valid until ${prettyDay(t.expires_on)}</span>` : ""}
      <span>${icon.tag} ${h.main}</span>
    </div>
  </div>
  <span class="scroll" aria-hidden="true">${icon.chevron}</span>
</section>
<main class="doc-body${locked ? " locked" : ""}" id="doc">
  ${visible.map((s, i) => section(s, i + 1, sel, t, locked, p.img))}
  ${q.lines.length > 0 || doc.sections.some((s) => s.kind === "pricing")
    ? html`<section class="doc-sec" id="investment"><div class="kicker">${String(n + 1).padStart(2, "0")}</div><h2>Investment</h2>${summary(q, t)}</section>`
    : ""}
  ${questionsBlock(p.questions, state.kind === "open", n + 2)}
  ${open
    ? html`<div class="accept-card"><div class="art grain"></div><h2>Ready to go ahead?</h2><p class="tot"><span data-t="dock">${h.main}</span> <span data-t="docksub">${h.sub}</span></p><button class="btn primary big" type="button" data-open-accept>${icon.sign} Accept proposal</button><br><button class="link" type="button" data-open-decline>Decline</button></div>`
    : decidedBlock(state, p.token)}
</main>
${open
  ? html`<div class="dock" id="dock"><div class="sum"><b data-t="dock">${h.main}</b><span data-t="docksub">${h.sub}</span></div><button class="btn primary" type="button" data-open-accept>Accept</button></div>${acceptDialog(doc)}`
  : ""}
${p.justAccepted ? html`<canvas id="confetti" aria-hidden="true"></canvas>` : ""}
<footer class="site" style="margin-top:0"><div class="wrap spread" style="max-width:780px"><span>${doc.brand.business_name}</span><span>Runs on <a href="https://whisk.run">Whisk</a></span></div></footer>`;
  return docLayout({
    title: `${t.title} · ${doc.brand.business_name}`,
    accent,
    body,
    data: { token: p.token, state: state.kind, sections: doc.sections, terms: { currency: t.currency, tax_mode: t.tax_mode, gst_rate_bp: t.gst_rate_bp, discount_bp: t.discount_bp, deposit_bp: t.deposit_bp }, selections: sel },
  });
};
