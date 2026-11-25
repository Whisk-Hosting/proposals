// The staff screens: the list of proposals, the editor, templates, the price list and settings.
import { html, raw } from "hono/html";
import { ago, bpText, centsText, followUp, followUpLabel, isLocked, prettyDay, prettyTime, shownStatus, type Frozen, type Proposal, type Shown } from "../model.js";
import { isIncluded, lineMeta, money, qtyFor, quote, type Item, type Section } from "../pricing.js";
import type { Activity, ApiKey, Delivery, Email, PriceItem, Question, Settings } from "../store.js";
import { icon } from "./icons.js";
import { artStyle, kindIcon, notice, statusBadge } from "./parts.js";
import { summary } from "./proposal.js";

const sel = (on: boolean) => (on ? raw(" selected") : "");
const chk = (on: boolean) => (on ? raw(" checked") : "");

// ----- Home: every proposal, what needs a nudge, what just happened -----

export type Filter = "all" | "open" | "draft" | "accepted" | "closed";
export const filters: { key: Filter; label: string; test: (s: Shown) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "open", label: "Open", test: (s) => s === "sent" || s === "viewed" },
  { key: "draft", label: "Drafts", test: (s) => s === "draft" },
  { key: "accepted", label: "Accepted", test: (s) => s === "accepted" },
  { key: "closed", label: "Declined or expired", test: (s) => s === "declined" || s === "expired" },
];

export type Stats = { open: number; openCount: number; won: number; wonCount: number; rate: number | null; decided: number };

// stats sums the proposals for the tiles at the top. Pure.
export const stats = (ps: readonly Proposal[], now: Date): Stats => {
  const shown = ps.map((p) => ({ p, s: shownStatus(p, now) }));
  const open = shown.filter((x) => x.s === "sent" || x.s === "viewed");
  const since = now.getTime() - 30 * 86400000;
  const won = shown.filter((x) => x.s === "accepted" && x.p.decided_at && new Date(x.p.decided_at).getTime() >= since);
  const decided = shown.filter((x) => x.s === "accepted" || x.s === "declined");
  return {
    open: open.reduce((n, x) => n + x.p.value_cents, 0),
    openCount: open.length,
    won: won.reduce((n, x) => n + x.p.value_cents, 0),
    wonCount: won.length,
    rate: decided.length === 0 ? null : Math.round((decided.filter((x) => x.s === "accepted").length / decided.length) * 100),
    decided: decided.length,
  };
};

const feedIcon: Record<string, [string, ReturnType<typeof raw>]> = {
  viewed: ["info", icon.eye],
  question: ["accent", icon.chat],
  accepted: ["good", icon.check],
  declined: ["bad", icon.x],
};

const feedVerb: Record<string, string> = { viewed: "opened", question: "asked about", accepted: "accepted", declined: "declined" };

export const home = (v: {
  list: Proposal[];
  all: Proposal[];
  filter: Filter;
  feed: (Activity & { proposal_id: number; title: string })[];
  currency: string;
  now: Date;
  flash?: string;
}) => {
  const st = stats(v.all, v.now);
  const m = (c: number) => money(c, v.currency);
  const nudges = v.all.flatMap((p) => {
    const f = followUp(p, v.now);
    return f ? [{ p, f }] : [];
  });
  return html`<div class="wrap">
  <div class="page-head">
    <div><h1>Proposals</h1></div>
    <form method="post" action="/proposals/new" class="inline"><button class="btn primary" type="submit">${icon.plus} New proposal</button></form>
  </div>
  ${notice("good", v.flash)}
  <div class="stats">
    <div class="stat hl"><span class="k">Open</span><span class="v">${m(st.open)}</span><span class="s">${st.openCount} waiting</span><span class="spark"></span></div>
    <div class="stat"><span class="k">Won, last 30 days</span><span class="v">${m(st.won)}</span><span class="s">${st.wonCount} accepted</span></div>
    <div class="stat"><span class="k">Win rate</span><span class="v">${st.rate === null ? "–" : `${st.rate}%`}</span><span class="s">of ${st.decided} decided</span></div>
    <div class="stat"><span class="k">To follow up</span><span class="v">${nudges.length}</span><span class="s">${nudges.length === 0 ? "All caught up" : "waiting on a nudge"}</span></div>
  </div>
  <div class="home-grid">
    <div>
      <nav class="tabs" aria-label="Filter">${filters.map((f) => html`<a href="/?show=${f.key}"${v.filter === f.key ? raw(' aria-current="page"') : ""}>${f.label} <span class="n">${v.all.filter((p) => f.test(shownStatus(p, v.now))).length}</span></a>`)}</nav>
      ${v.list.length === 0
        ? html`<div class="empty"><h2>Nothing here</h2><form method="post" action="/proposals/new" class="inline"><button class="btn primary" type="submit">${icon.plus} New proposal</button></form></div>`
        : html`<div class="plist">${v.list.map((p) => {
            const s = shownStatus(p, v.now);
            const last = p.decided_at ?? p.last_viewed_at ?? p.sent_at ?? p.updated_at;
            return html`<a class="prow st-${s}" href="/proposals/${p.id}">
            <span class="rail"></span>
            <span style="min-width:0"><div class="t">${p.title}</div><div class="c">${[p.client_company, p.client_name].filter(Boolean).join(" · ") || "No client yet"}</div></span>
            <span class="row" style="gap:10px;flex-wrap:nowrap">${statusBadge(s)}<span class="val">${m(p.value_cents)}</span></span>
            <span class="when">${ago(last, v.now)}</span>
          </a>`;
          })}</div>`}
    </div>
    <aside>
      ${nudges.length > 0
        ? html`<div class="side-card"><h2>${icon.bell} Follow up</h2><div class="attention">${nudges.slice(0, 6).map((n) => html`<a href="/proposals/${n.p.id}#follow-up"><span>${n.p.client_company || n.p.title}</span><span class="badge warn">${followUpLabel[n.f!]}</span></a>`)}</div></div>`
        : ""}
      <div class="side-card"><h2>${icon.pulse} Latest</h2>
        ${v.feed.length === 0
          ? html`<p class="muted small" style="margin:0">Nothing yet</p>`
          : html`<ul class="feed">${v.feed.map((a) => {
              const [cls, ic] = feedIcon[a.kind] ?? ["", icon.doc];
              return html`<li><span class="ic ${cls}">${ic}</span><div><div><b>${a.actor}</b> ${feedVerb[a.kind] ?? a.kind} <a href="/proposals/${a.proposal_id}">${a.title}</a></div>${a.kind === "question" && a.detail ? html`<div class="q">${a.detail}</div>` : ""}<div class="m">${ago(a.at, v.now)}</div></div></li>`;
            })}</ul>`}
      </div>
    </aside>
  </div>
</div>`;
};

// ----- The editor -----

const autosave = (action: string, id: string, body: ReturnType<typeof html>) => html`<form method="post" action="${action}" data-autosave id="${id}">${body}</form>`;

const savedMark = html`<span class="saved" aria-live="polite">${icon.check} Saved</span>`;

const coverCard = (p: Proposal, coverUrl: string | null) => html`<section class="card cover-card" id="cover">
  <div class="cover-preview art${coverUrl ? " img" : ""}" style="${artStyle(coverUrl)}"></div>
  <div class="body">
    ${autosave(`/proposals/${p.id}`, "f-cover", html`
      <div class="field"><label for="title">Title</label><input id="title" name="title" type="text" maxlength="160" value="${p.title}" required></div>
      <div class="field"><label for="subtitle">Subtitle</label><input id="subtitle" name="subtitle" type="text" maxlength="240" value="${p.subtitle}"></div>
      <div class="grid-3">
        <div class="field"><label for="client_name">Client</label><input id="client_name" name="client_name" type="text" maxlength="120" value="${p.client_name}" autocomplete="off"></div>
        <div class="field"><label for="client_company">Company</label><input id="client_company" name="client_company" type="text" maxlength="120" value="${p.client_company}" autocomplete="off"></div>
        <div class="field"><label for="client_email">Email</label><input id="client_email" name="client_email" type="email" maxlength="254" value="${p.client_email}" autocomplete="off"></div>
      </div>
      <div class="spread"><div class="row">
        <label class="btn small" data-upload="/proposals/${p.id}/cover">${icon.image} ${coverUrl ? "Change cover" : "Cover picture"}<input type="file" accept="image/*" hidden></label>
        ${coverUrl ? html`<button class="btn small ghost" type="submit" name="cover" value="remove" formnovalidate>Remove picture</button>` : ""}
        <span class="small muted" data-upload-status></span>
      </div>${savedMark}</div>`)}
  </div>
</section>`;

const kindLabel = (s: Section) => (s.kind === "pricing" ? (s.pick_one ? "Packages" : "Pricing") : s.kind === "image" ? "Picture" : "Text");

const itemKind = (s: Section, i: Item) => (s.pick_one ? (i.recommended ? "recommended" : "option") : i.mode === "fixed" ? "fixed" : i.selected ? "on" : "off");

const itemRow = (s: Section, i: Item | null, n: number) => {
  const it: Item = i ?? { id: 0, name: "", description: "", unit_price: 0, quantity: 1, unit: "", mode: "fixed", selected: true, recommended: false, qty_editable: false, qty_min: 1, qty_max: 10, recurring: "once" };
  const k = itemKind(s, it);
  return html`<div class="item-ed">
  <input type="hidden" name="id" value="${i ? i.id : ""}">
  <div class="r1">
    <div><label class="mini" for="n-${s.id}-${n}">Item</label><input id="n-${s.id}-${n}" type="text" name="name" maxlength="160" value="${it.name}" placeholder="Name"></div>
    <div><label class="mini">Price</label><input type="text" name="price" inputmode="decimal" value="${centsText(it.unit_price)}"></div>
    <div><label class="mini">Qty</label><input type="number" name="qty" min="0" max="100000" value="${it.quantity}"></div>
    <div><label class="mini">Unit</label><input type="text" name="unit" maxlength="20" value="${it.unit}" placeholder="each"></div>
    <button class="icon-btn" type="submit" name="remove" value="${n}" title="Remove" aria-label="Remove ${it.name}" formnovalidate>${icon.trash}</button>
  </div>
  <textarea name="description" maxlength="600" rows="1" placeholder="Description">${it.description}</textarea>
  <div class="r3">
    <select name="kind" aria-label="Kind">${s.pick_one
      ? html`<option value="option"${sel(k === "option")}>Option</option><option value="recommended"${sel(k === "recommended")}>Recommended</option>`
      : html`<option value="fixed"${sel(k === "fixed")}>Included</option><option value="on"${sel(k === "on")}>Optional, ticked</option><option value="off"${sel(k === "off")}>Optional, not ticked</option>`}</select>
    <select name="recurring" aria-label="Billing"><option value="once"${sel(it.recurring === "once")}>One-off</option><option value="month"${sel(it.recurring === "month")}>Monthly</option></select>
    ${s.pick_one
      ? html`<input type="hidden" name="qtymode" value="fixed"><input type="hidden" name="qmin" value="1"><input type="hidden" name="qmax" value="1">`
      : html`<select name="qtymode" aria-label="Quantity"><option value="fixed"${sel(!it.qty_editable)}>Fixed qty</option><option value="client"${sel(it.qty_editable)}>Client picks qty</option></select>
    <span class="row" style="gap:6px" data-qty-range${it.qty_editable ? "" : raw(" hidden")}><input type="number" name="qmin" min="0" max="100000" value="${it.qty_min}" aria-label="Fewest"> to <input type="number" name="qmax" min="0" max="100000" value="${it.qty_max}" aria-label="Most"></span>`}
  </div>
</div>`;
};

const sectionCard = (p: Proposal, s: Section, i: number, count: number, prices: PriceItem[], img: (id: string, w: number) => string) => html`<section class="card" id="s${s.id}">
  <header>
    <h3><span class="kind">${kindIcon(s.kind)}</span>${kindLabel(s)}</h3>
    <form method="post" action="/sections/${s.id}/move" class="inline"><button class="icon-btn" name="by" value="-1" aria-label="Move up"${i === 0 ? raw(" disabled") : ""}>${icon.up}</button><button class="icon-btn" name="by" value="1" aria-label="Move down"${i === count - 1 ? raw(" disabled") : ""}>${icon.down}</button></form>
    <form method="post" action="/sections/${s.id}/delete" class="inline" data-confirm="Delete this section?"><button class="icon-btn" aria-label="Delete section">${icon.trash}</button></form>
  </header>
  <div class="body">
    ${autosave(`/sections/${s.id}`, `f-s${s.id}`, html`
      <div class="field"><label for="h-${s.id}">Heading</label><input id="h-${s.id}" name="heading" type="text" maxlength="160" value="${s.heading}"></div>
      ${s.kind === "text"
        ? html`<div class="field"><label for="b-${s.id}">Text</label><textarea id="b-${s.id}" name="body" rows="8" maxlength="20000" data-grow>${s.body}</textarea></div>`
        : s.kind === "image"
          ? html`${s.image_upload_id ? html`<img src="${img(s.image_upload_id, 800)}" alt="" style="border-radius:12px;margin-bottom:12px;display:block">` : ""}
            <div class="field"><label for="b-${s.id}">Caption</label><input id="b-${s.id}" name="body" type="text" maxlength="300" value="${s.body}"></div>
            <div class="row"><label class="btn small" data-upload="/sections/${s.id}/image">${icon.image} ${s.image_upload_id ? "Change picture" : "Choose picture"}<input type="file" accept="image/*" hidden></label><span class="small muted" data-upload-status></span></div>`
          : html`<div class="field"><label for="b-${s.id}">Intro</label><input id="b-${s.id}" name="body" type="text" maxlength="300" value="${s.body}"></div>
            <div class="items">${s.items.map((it, n) => itemRow(s, it, n))}</div>
            <div class="items-foot">
              <div class="row">
                <button class="btn small" type="submit" name="add" value="blank" formnovalidate>${icon.plus} Item</button>
                ${prices.length > 0
                  ? html`<select name="from_list" aria-label="From the price list"><option value="">From price list…</option>${prices.map((x) => html`<option value="${x.id}">${x.name} · ${money(x.unit_price, p.currency)}</option>`)}</select><button class="btn small" type="submit" name="add" value="list" formnovalidate>Add</button>`
                  : ""}
              </div>
              <button class="btn small primary" type="submit">Save</button>
            </div>`}
      <div class="spread" style="margin-top:10px"><span></span>${savedMark}</div>`)}
  </div>
</section>`;

const shareCard = (p: Proposal, link: string, now: Date) => {
  const s = shownStatus(p, now);
  const f = followUp(p, now);
  return html`<div class="card"><header><h2>${statusBadge(s)}</h2><span class="num" style="font-weight:700">${money(p.value_cents, p.currency)}</span></header>
  <div class="body share">
    ${p.status === "draft"
      ? html`<a class="btn primary block" href="/proposals/${p.id}/send">${icon.send} Send</a>`
      : html`<div class="copyfield"><input id="link" type="text" readonly value="${link}" aria-label="Link for the client"><button class="icon-btn" type="button" data-copy="link" aria-label="Copy link">${icon.copy}</button></div>`}
    <div class="row" style="gap:6px">
      <a class="btn small" href="/proposals/${p.id}/preview">${icon.eye} Preview</a>
      ${p.status === "sent" ? html`<a class="btn small" href="${link}" target="_blank" rel="noopener">${icon.external} Open</a>` : ""}
      <details class="menu"><summary class="btn small" aria-label="More">${icon.more}</summary><div class="menu-body">
        <form method="post" action="/proposals/${p.id}/duplicate"><button class="btn ghost small">${icon.duplicate} Duplicate</button></form>
        <form method="post" action="/proposals/${p.id}/template"><button class="btn ghost small">${icon.layers} Save as template</button></form>
        ${p.status === "sent" ? html`<form method="post" action="/proposals/${p.id}/draft"><button class="btn ghost small">${icon.undo} Back to draft</button></form>` : ""}
        <form method="post" action="/proposals/${p.id}/delete" data-confirm="Delete this proposal for good?"><button class="btn ghost small danger">${icon.trash} Delete</button></form>
      </div></details>
    </div>
    ${p.status !== "draft"
      ? html`<dl class="kv"><dt>Sent</dt><dd>${p.sent_at ? prettyTime(p.sent_at) : "–"}</dd><dt>Views</dt><dd>${p.view_count}</dd>${p.last_viewed_at ? html`<dt>Last opened</dt><dd>${ago(p.last_viewed_at, now)}</dd>` : ""}</dl>`
      : ""}
    ${p.status === "sent" && p.client_email
      ? html`<form method="post" action="/proposals/${p.id}/follow-up" id="follow-up" class="share" style="margin-top:6px">
        ${f ? html`<span class="badge warn" style="width:fit-content">${followUpLabel[f]}</span>` : ""}
        <textarea name="note" rows="2" maxlength="2000" placeholder="Follow-up note" aria-label="Follow-up note"></textarea>
        <button class="btn small" type="submit">${icon.mail} Send follow-up</button></form>`
      : ""}
  </div></div>`;
};

const termsCard = (p: Proposal) => html`<div class="card"><header><h2>Terms</h2></header><div class="body">
  ${autosave(`/proposals/${p.id}`, "f-terms", html`
    <div class="grid-2">
      <div class="field"><label for="currency">Currency</label><input id="currency" name="currency" type="text" maxlength="3" value="${p.currency}" style="text-transform:uppercase"></div>
      <div class="field"><label for="expires_on">Valid until</label><input id="expires_on" name="expires_on" type="date" value="${p.expires_on ?? ""}"></div>
    </div>
    <div class="field"><label for="tax_mode">Prices</label><select id="tax_mode" name="tax_mode"><option value="exclusive"${sel(p.tax_mode === "exclusive")}>Plus tax</option><option value="inclusive"${sel(p.tax_mode === "inclusive")}>Include tax</option><option value="none"${sel(p.tax_mode === "none")}>No tax</option></select></div>
    <div class="grid-3">
      <div class="field"><label for="gst">Tax %</label><input id="gst" name="gst" type="text" inputmode="decimal" value="${bpText(p.gst_rate_bp)}"></div>
      <div class="field"><label for="discount">Discount %</label><input id="discount" name="discount" type="text" inputmode="decimal" value="${bpText(p.discount_bp)}"></div>
      <div class="field"><label for="deposit">Deposit %</label><input id="deposit" name="deposit" type="text" inputmode="decimal" value="${bpText(p.deposit_bp)}"></div>
    </div>
    <div class="spread"><span></span>${savedMark}</div>`)}
</div></div>`;

const questionsCard = (p: Proposal, qs: Question[]) =>
  qs.length === 0
    ? ""
    : html`<div class="card" id="questions"><header><h2>${icon.chat} Questions</h2></header><div class="body">${qs.map((q) => html`<div class="qa-ed">
  <div class="who">${q.asked_by || "Client"} · ${prettyTime(q.asked_at)}</div>
  <p>${q.body}</p>
  ${q.answer
    ? html`<div class="small" style="padding:8px 12px;border-radius:10px;background:var(--accent-soft)"><b>${q.answered_by}:</b> ${q.answer}</div>`
    : isLocked(p)
      ? ""
      : html`<form method="post" action="/proposals/${p.id}/questions/${q.id}" class="share"><textarea name="answer" rows="2" maxlength="2000" required aria-label="Answer"></textarea><button class="btn small primary" type="submit">Answer</button></form>`}
</div>`)}</div></div>`;

const activityLabel: Record<string, string> = {
  created: "Created",
  sent: "Sent",
  viewed: "Opened",
  question: "Asked a question",
  answer: "Answered a question",
  follow_up: "Followed up",
  accepted: "Accepted",
  declined: "Declined",
  draft: "Back to draft",
};

const activityCard = (as: Activity[], now: Date) => html`<div class="card"><header><h2>Activity</h2></header><div class="body">
  ${as.length === 0
    ? html`<p class="muted small" style="margin:0">Nothing yet</p>`
    : html`<ul class="feed">${as.map((a) => {
        const [cls, ic] = feedIcon[a.kind] ?? ["", a.kind === "sent" ? icon.send : a.kind === "follow_up" ? icon.mail : icon.doc];
        return html`<li><span class="ic ${cls}">${ic}</span><div><div><b>${activityLabel[a.kind] ?? a.kind}</b> · ${a.actor}</div>${a.detail && a.kind !== "question" ? html`<div class="m">${a.detail}</div>` : ""}<div class="m" title="${prettyTime(a.at)}">${ago(a.at, now)}</div></div></li>`;
      })}</ul>`}
</div></div>`;

// What the client agreed to, for an accepted proposal: drawn from the frozen copy.
const acceptedCard = (p: Proposal, f: Frozen, fp: string) => {
  const t = f.doc.proposal;
  const lines = f.doc.sections.filter((s) => s.kind === "pricing").flatMap((s) => s.items.filter((i) => isIncluded(s, i, f.selections)).map((i) => ({ i, qty: qtyFor(i, f.selections) })));
  return html`<section class="card"><header><h2>${icon.check} What ${f.acceptance.name} accepted</h2></header><div class="body">
  <div class="lines" style="margin-bottom:18px">${lines.map(({ i, qty }) => html`<div class="line"><div class="lead">${icon.check}</div><div class="name">${i.name}</div><div class="price">${money(i.unit_price * qty, t.currency)}<small>${lineMeta(i, qty, t.currency)}</small></div></div>`)}</div>
  ${summary(f.quote, t)}
  <div class="decided" style="margin-top:18px">
    ${f.acceptance.signature.kind === "typed" ? html`<div class="sig">${f.acceptance.signature.text}</div>` : html`<div class="sig"><svg viewBox="0 0 1000 300"><path d="${f.acceptance.signature.path}"/></svg></div>`}
    <dl class="kv" style="grid-template-columns:auto 1fr"><dt>Name</dt><dd>${f.acceptance.name}</dd><dt>Email</dt><dd>${f.acceptance.email}</dd><dt>When</dt><dd>${prettyTime(f.acceptance.accepted_at)}</dd><dt>IP address</dt><dd>${f.acceptance.ip || "–"}</dd></dl>
    <div class="fp">SHA-256 ${fp}</div>
    <div class="row"><a class="btn primary" href="/p/${p.token}/pdf">${icon.download} PDF</a><a class="btn" href="/p/${p.token}" target="_blank" rel="noopener">${icon.eye} Client's page</a></div>
  </div>
</div></section>`;
};

export const editor = (v: {
  p: Proposal;
  sections: Section[];
  activity: Activity[];
  questions: Question[];
  prices: PriceItem[];
  link: string;
  now: Date;
  flash?: string;
  accepted?: { frozen: Frozen; fingerprint: string };
  img: (id: string, w: number) => string;
}) => {
  const { p } = v;
  const locked = isLocked(p);
  const coverUrl = p.cover_upload_id ? v.img(p.cover_upload_id, 1200) : null;
  return html`<div class="wrap">
  <div class="page-head"><div><div class="crumbs"><a href="${p.is_template ? "/templates" : "/"}">${p.is_template ? "Templates" : "Proposals"}</a></div><h1 style="font-size:clamp(1.6rem,3.5vw,2.3rem)">${p.title}</h1></div></div>
  ${notice("good", v.flash)}
  ${locked
    ? html`<div class="lockbar">${statusBadge(shownStatus(p, v.now))}<span>${p.status === "accepted" ? "Accepted" : "Declined"} ${p.decided_at ? prettyTime(p.decided_at) : ""}${p.decline_reason ? html` · “${p.decline_reason}”` : ""}</span><form method="post" action="/proposals/${p.id}/duplicate" class="inline" style="margin-left:auto"><button class="btn small">${icon.duplicate} Duplicate to change</button></form></div>`
    : ""}
  <div class="editor">
    <div>
      ${locked && v.accepted
        ? acceptedCard(p, v.accepted.frozen, v.accepted.fingerprint)
        : locked
          ? html`<div class="card"><div class="body"><a class="btn" href="/p/${p.token}" target="_blank" rel="noopener">${icon.eye} Client's page</a></div></div>`
          : html`${coverCard(p, coverUrl)}
      <div class="sections">${v.sections.map((s, i) => sectionCard(p, s, i, v.sections.length, v.prices, v.img))}</div>
      <div class="add-bar">
        ${(["text", "pricing", "packages", "image"] as const).map((k) => html`<form method="post" action="/proposals/${p.id}/sections"><button class="btn small" name="kind" value="${k}">${icon.plus} ${k === "text" ? "Text" : k === "pricing" ? "Pricing" : k === "packages" ? "Packages" : "Picture"}</button></form>`)}
      </div>`}
    </div>
    <aside>
      ${p.is_template
        ? html`<div class="card"><div class="body share"><form method="post" action="/templates/${p.id}/use"><button class="btn primary block">${icon.plus} New proposal from this</button></form><a class="btn small" href="/proposals/${p.id}/preview">${icon.eye} Preview</a><form method="post" action="/proposals/${p.id}/delete" data-confirm="Delete this template?"><button class="btn small ghost danger">${icon.trash} Delete template</button></form></div></div>`
        : shareCard(p, v.link, v.now)}
      ${questionsCard(p, v.questions)}
      ${locked ? "" : termsCard(p)}
      ${p.is_template ? "" : activityCard(v.activity, v.now)}
    </aside>
  </div>
</div>`;
};

// ----- Sending -----

export const sendPage = (p: Proposal, link: string, error?: string) => html`<div class="wrap" style="max-width:720px">
  <div class="page-head"><div><div class="crumbs"><a href="/proposals/${p.id}">${p.title}</a></div><h1>Send</h1></div></div>
  ${notice("error", error)}
  <form method="post" action="/proposals/${p.id}/send" class="panel">
    <div class="grid-2">
      <div class="field"><label for="to_name">Client</label><input id="to_name" name="client_name" type="text" maxlength="120" value="${p.client_name}"></div>
      <div class="field"><label for="to">Email</label><input id="to" name="client_email" type="email" maxlength="254" value="${p.client_email}"></div>
    </div>
    <div class="field"><label for="note">Message</label><textarea id="note" name="note" rows="5" maxlength="4000">Here's our proposal for ${p.client_company || "you"}. You can choose options, ask questions and accept it online.</textarea></div>
    <div class="spread">
      <button class="btn primary" type="submit" name="how" value="email">${icon.send} Send email</button>
      <button class="btn ghost" type="submit" name="how" value="link">${icon.copy} I'll send the link myself</button>
    </div>
  </form>
  <p class="small muted" style="margin-top:14px">${link}</p>
</div>`;

// ----- Templates -----

export const templatesPage = (ts: Proposal[], flash?: string) => html`<div class="wrap">
  <div class="page-head"><div><h1>Templates</h1></div></div>
  ${notice("good", flash)}
  <div class="tiles">
    <form method="post" action="/proposals/new" style="display:contents"><button class="tile new" type="submit">${icon.plus} Blank proposal</button></form>
    ${ts.map((t) => html`<a class="tile" href="/proposals/${t.id}"><div class="art"></div><div class="in"><b>${t.title}</b><span>${t.subtitle || "Template"}</span><span>${money(t.value_cents, t.currency)}</span></div></a>`)}
  </div>
</div>`;

// ----- Price list -----

export const pricesPage = (items: PriceItem[], currency: string, editing?: PriceItem, flash?: string) => html`<div class="wrap" style="max-width:900px">
  <div class="page-head"><div><h1>Price list</h1></div></div>
  ${notice("good", flash)}
  <form method="post" action="/prices${editing ? `/${editing.id}` : ""}" class="panel" style="margin-bottom:22px">
    <div class="grid-3">
      <div class="field" style="grid-column:span 2"><label for="pl-name">Item</label><input id="pl-name" name="name" type="text" maxlength="160" required value="${editing?.name ?? ""}"></div>
      <div class="field"><label for="pl-price">Price</label><input id="pl-price" name="price" type="text" inputmode="decimal" required value="${editing ? centsText(editing.unit_price) : ""}"></div>
    </div>
    <div class="grid-3">
      <div class="field" style="grid-column:span 2"><label for="pl-desc">Description</label><input id="pl-desc" name="description" type="text" maxlength="600" value="${editing?.description ?? ""}"></div>
      <div class="grid-2" style="gap:0 10px">
        <div class="field"><label for="pl-unit">Unit</label><input id="pl-unit" name="unit" type="text" maxlength="20" value="${editing?.unit ?? ""}" placeholder="each"></div>
        <div class="field"><label for="pl-rec">Billing</label><select id="pl-rec" name="recurring"><option value="once"${sel(editing?.recurring !== "month")}>One-off</option><option value="month"${sel(editing?.recurring === "month")}>Monthly</option></select></div>
      </div>
    </div>
    <div class="row"><button class="btn primary" type="submit">${editing ? "Save" : html`${icon.plus} Add`}</button>${editing ? html`<a class="btn ghost" href="/prices">Cancel</a>` : ""}</div>
  </form>
  ${items.length === 0
    ? html`<div class="empty"><h2>No saved items</h2></div>`
    : html`<div class="panel table-wrap" style="padding:8px 12px"><table class="table"><thead><tr><th>Item</th><th class="right">Price</th><th></th></tr></thead><tbody>
    ${items.map((i) => html`<tr><td><b>${i.name}</b>${i.description ? html`<div class="small muted">${i.description}</div>` : ""}</td><td class="right num" style="white-space:nowrap">${money(i.unit_price, currency)}${i.unit ? ` / ${i.unit}` : ""}${i.recurring === "month" ? " / month" : ""}</td>
    <td class="right" style="white-space:nowrap"><a class="icon-btn" href="/prices?edit=${i.id}" aria-label="Edit ${i.name}">${icon.edit}</a><form method="post" action="/prices/${i.id}/delete" class="inline" data-confirm="Delete ${i.name}?"><button class="icon-btn" aria-label="Delete ${i.name}">${icon.trash}</button></form></td></tr>`)}
    </tbody></table></div>`}
</div>`;

// ----- Settings -----

const emailBadge = (s: string) => html`<span class="badge ${s === "sent" ? "good" : s === "failed" ? "bad" : s === "pending" ? "info" : ""}">${s}</span>`;

export const settingsPage = (v: { s: Settings; emails: Email[]; deliveries: Delivery[]; api: ApiView; logoUrl: string | null; demo: boolean; flash?: string; error?: string; now: Date }) => {
  const { s } = v;
  return html`<div class="wrap" style="max-width:900px">
  <div class="page-head"><div><h1>Settings</h1></div><a class="btn" href="/export.csv">${icon.download} Export CSV</a></div>
  ${notice("good", v.flash)}${notice("error", v.error)}
  <form method="post" action="/settings" class="stack" style="max-width:none">
    <section class="panel">
      <h2 style="font-size:1.1rem">Brand</h2>
      <div class="grid-2">
        <div class="field"><label for="business_name">Business name</label><input id="business_name" name="business_name" type="text" maxlength="120" required value="${s.business_name}"></div>
        <div class="field"><label for="accent">Color</label><div class="row"><input id="accent" name="accent" type="color" value="${s.accent}"><span class="art" style="flex:1;height:40px;border-radius:10px"></span></div></div>
      </div>
      <div class="row">${v.logoUrl ? html`<img src="${v.logoUrl}" alt="Logo" style="height:40px;border-radius:8px">` : ""}<label class="btn small" data-upload="/settings/logo">${icon.image} ${v.logoUrl ? "Change logo" : "Logo"}<input type="file" accept="image/*" hidden></label>${v.logoUrl ? html`<button class="btn small ghost" name="logo" value="remove">Remove logo</button>` : ""}<span class="small muted" data-upload-status></span></div>
    </section>
    <section class="panel">
      <h2 style="font-size:1.1rem">New proposals</h2>
      <div class="grid-3">
        <div class="field"><label for="currency">Currency</label><input id="currency" name="currency" type="text" maxlength="3" value="${s.currency}" style="text-transform:uppercase"></div>
        <div class="field"><label for="tax_mode">Prices</label><select id="tax_mode" name="tax_mode"><option value="exclusive"${sel(s.tax_mode === "exclusive")}>Plus tax</option><option value="inclusive"${sel(s.tax_mode === "inclusive")}>Include tax</option><option value="none"${sel(s.tax_mode === "none")}>No tax</option></select></div>
        <div class="field"><label for="gst">Tax %</label><input id="gst" name="gst" type="text" inputmode="decimal" value="${bpText(s.gst_rate_bp)}"></div>
      </div>
      <div class="field" style="max-width:220px"><label for="valid_days">Valid for (days)</label><input id="valid_days" name="valid_days" type="number" min="1" max="365" value="${s.valid_days}"></div>
    </section>
    <section class="panel">
      <h2 style="font-size:1.1rem">Email</h2>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" name="email_on" value="1"${chk(s.email_on)}> Send email</label>
      <div class="grid-2">
        <div class="field"><label for="notify_email">Alerts to</label><input id="notify_email" name="notify_email" type="email" maxlength="254" value="${s.notify_email}" placeholder="Each proposal's author"></div>
        <div class="field"><label for="email_from">From address</label><input id="email_from" name="email_from" type="email" maxlength="254" value="${s.email_from}" placeholder="Whisk's address"${v.demo ? raw(" readonly") : ""}></div>
      </div>
    </section>
    <section class="panel">
      <h2 style="font-size:1.1rem">Webhook</h2>
      <div class="field"><label for="webhook_url">URL</label><input id="webhook_url" name="webhook_url" type="url" maxlength="500" value="${s.webhook_url}" placeholder="https://"${v.demo ? raw(" readonly") : ""}></div>
      ${s.webhook_url
        ? html`<div class="field"><label for="secret">Signing secret</label><div class="copyfield"><input id="secret" type="text" readonly value="${s.webhook_secret}"><button class="icon-btn" type="button" data-copy="secret" aria-label="Copy secret">${icon.copy}</button></div></div>`
        : ""}
    </section>
    <div><button class="btn primary" type="submit">Save settings</button></div>
  </form>
  <div class="stack" style="max-width:none;margin-top:28px">
    ${apiPanel(v.api, v.now)}
    ${s.webhook_url
      ? html`<section class="panel"><div class="spread"><h2 style="font-size:1.1rem;margin:0">Webhook deliveries</h2><form method="post" action="/settings/webhook-test" class="inline"><button class="btn small">${icon.send} Send a test</button></form></div>
      ${v.deliveries.length === 0 ? html`<p class="muted small">None yet</p>` : html`<div class="table-wrap"><table class="table"><tbody>${v.deliveries.map((d) => html`<tr><td>${d.event}</td><td>${emailBadge(d.status)}</td><td class="small muted">${d.last_error || (d.last_status ? `HTTP ${d.last_status}` : "")}</td><td class="small muted right">${ago(d.created_at, v.now)}</td></tr>`)}</tbody></table></div>`}</section>`
      : ""}
    <section class="panel"><div class="spread"><h2 style="font-size:1.1rem;margin:0">Recent email</h2><form method="post" action="/settings/email-test" class="inline"><button class="btn small">${icon.mail} Send me a test</button></form></div>
      ${v.emails.length === 0 ? html`<p class="muted small">None yet</p>` : html`<div class="table-wrap"><table class="table"><tbody>${v.emails.map((e) => html`<tr><td><b>${e.subject}</b><div class="small muted">${e.to_email}</div></td><td>${emailBadge(e.status)}${e.error ? html`<div class="small muted">${e.error}</div>` : ""}</td><td class="small muted right">${ago(e.created_at, v.now)}</td></tr>`)}</tbody></table></div>`}
    </section>
  </div>
</div>`;
};

// ----- API keys, on the settings page -----

export type ApiView = { keys: ApiKey[]; base: string; newKey?: string };

const keyUse = (k: ApiKey, now: Date) => (k.revoked_at ? `Turned off ${ago(k.revoked_at, now)}` : k.last_used_at ? `Used ${ago(k.last_used_at, now)}` : "Not used yet");

export const apiPanel = (a: ApiView, now: Date) => html`<section class="panel" id="api">
  <h2 style="font-size:1.1rem">API keys</h2>
  <p class="small muted" style="margin-top:0">Scripts and AI agents use a key to do what this app's screens do: make, price and send proposals, and read what clients accepted.</p>
  ${a.newKey
    ? html`<div class="notice good" role="status"><div style="margin-bottom:8px"><b>Copy the key now.</b> It won't show again.</div>
      <div class="copyfield"><input id="new-key" type="text" readonly value="${a.newKey}" aria-label="New API key"><button class="icon-btn" type="button" data-copy="new-key" aria-label="Copy key">${icon.copy}</button></div></div>`
    : ""}
  ${a.keys.length === 0
    ? html`<p class="small muted">No keys yet. Make one below.</p>`
    : html`<div class="table-wrap"><table class="table"><tbody>${a.keys.map(
        (k) => html`<tr${k.revoked_at ? raw(' class="faded"') : ""}>
      <td><b>${k.label}</b><div class="small muted"><code>${k.prefix}…</code> · ${k.created_by}</div></td>
      <td class="small muted">${keyUse(k, now)}</td>
      <td class="right">${k.revoked_at ? "" : html`<form method="post" action="/settings/keys/${k.id}/revoke" class="inline" data-confirm="Turn off ${k.label}? Anything using it stops working."><button class="btn small ghost danger">Turn off</button></form>`}</td>
    </tr>`,
      )}</tbody></table></div>`}
  <form method="post" action="/settings/keys" class="row" style="margin-top:16px;align-items:flex-end;flex-wrap:wrap" data-busy>
    <div class="field" style="flex:1;min-width:200px;margin:0"><label for="key-label">Name</label><input id="key-label" name="label" type="text" required maxlength="80" placeholder="CRM, or the agent's name"></div>
    <button class="btn" type="submit">${icon.key} Make key</button>
  </form>
  <details style="margin-top:20px"><summary class="small" style="cursor:pointer;font-weight:650">How to use the API</summary>
    <p class="small muted">Base URL <code>${a.base}</code></p>
    <pre class="codeblock">curl ${a.base}/proposals?status=viewed \\
  -H "Authorization: Bearer YOUR_KEY"

curl ${a.base}/proposals \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"template_id": 1, "client": {"name": "Ana Silva", "email": "ana@example.com"}}'</pre>
    <p class="small muted">GET ${a.base} lists every endpoint. Money is in cents. Errors come back as {"error": {"code", "message", "fix"}}.</p>
  </details>
</section>`;

export const previewQuote = (sections: Section[], p: Proposal) => quote(sections, { optional: {}, picks: {}, quantities: {} }, p);
export const dayLabel = prettyDay;
