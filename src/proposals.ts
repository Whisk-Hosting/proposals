// The steps shared by the client's page, the staff pages and the PDF: building what the page
// draws, telling the business what happened, and what webhooks carry.
import { alertEmail, type Alert } from "./emails.js";
import { email, emit } from "./events.js";
import { isExpired, type Proposal, type ProposalDoc } from "./model.js";
import { defaultSelections, quote, type Quote, type Selections } from "./pricing.js";
import * as store from "./store.js";
import { baseUrl, clientLink } from "./web.js";
import type { DocState } from "./views/proposal.js";

// liveDoc is the proposal as it stands now, before anyone has accepted it.
export const liveDoc = async (p: Proposal, s?: store.Settings): Promise<ProposalDoc> => {
  const settings = s ?? (await store.settings());
  return {
    brand: { business_name: settings.business_name, accent: settings.accent, logo_upload_id: settings.logo_upload_id },
    proposal: {
      id: p.id, title: p.title, subtitle: p.subtitle, client_name: p.client_name, client_company: p.client_company, cover_upload_id: p.cover_upload_id,
      expires_on: p.expires_on, currency: p.currency, tax_mode: p.tax_mode, gst_rate_bp: p.gst_rate_bp, discount_bp: p.discount_bp,
      deposit_bp: p.deposit_bp, owner_name: p.owner_name, owner_email: p.owner_email,
    },
    sections: await store.sectionsFor(p.id),
  };
};

export type View = { doc: ProposalDoc; state: DocState; selections: Selections; quote: Quote };

// view decides what the client's page shows: the frozen copy once accepted, else the live
// proposal, open or closed.
export const view = async (p: Proposal, now: Date, preview = false): Promise<View> => {
  if (p.status === "accepted") {
    const a = await store.acceptance(p.id);
    if (a) return { doc: a.frozen.doc, state: { kind: "accepted", frozen: a.frozen, fingerprint: a.fingerprint }, selections: a.frozen.selections, quote: a.frozen.quote };
  }
  const doc = await liveDoc(p);
  const selections = defaultSelections(doc.sections);
  const q = quote(doc.sections, selections, doc.proposal);
  const state: DocState = preview
    ? { kind: "preview" }
    : p.status === "declined"
      ? { kind: "declined", reason: p.decline_reason, at: p.decided_at }
      : p.status === "draft"
        ? { kind: "draft" }
        : isExpired(p, now)
          ? { kind: "expired" }
          : { kind: "open" };
  return { doc, state, selections, quote: q };
};

export const editLink = (p: Pick<Proposal, "id">) => `${baseUrl()}/proposals/${p.id}`;

// alert emails the business: the proposal's owner, or the settings' alert address when set.
export const alert = async (p: Proposal, a: Alert) => {
  const s = await store.settings();
  const to = s.notify_email || p.owner_email;
  if (to) await email(`alert.${a.kind}`, alertEmail(s, p, to, a, editLink(p)));
};

// What a webhook says about a proposal.
export const proposalRef = (p: Proposal, extra: Record<string, unknown> = {}) => ({
  id: p.id,
  title: p.title,
  client: { name: p.client_name, company: p.client_company, email: p.client_email },
  currency: p.currency,
  value_cents: p.value_cents,
  url: clientLink(p.token),
  ...extra,
});

export const webhook = (event: Parameters<typeof emit>[0], p: Proposal, extra: Record<string, unknown> = {}) => emit(event, { proposal: proposalRef(p, extra) });
