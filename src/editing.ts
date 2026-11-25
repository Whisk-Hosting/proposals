// Reading the staff forms into rows. Pure: a form comes in as plain values, rows come out, and
// anything a person could not have meant (a negative price, a range upside down) is put right
// rather than refused, because the editor saves as people type.
import { asTaxMode, cents, intIn, isCurrency, isDay, percentBp, text, type Proposal } from "./model.js";
import type { Item, Section } from "./pricing.js";
import type { ItemInput, PriceItem, ProposalFields, Settings } from "./store.js";

export type Fields = Readonly<Record<string, string | readonly string[]>>;

// one is a field's last value; many is every value, in order.
export const one = (f: Fields, k: string) => {
  const v = f[k];
  return typeof v === "string" ? v : v && v.length > 0 ? v[v.length - 1] : undefined;
};
export const many = (f: Fields, k: string): readonly string[] => {
  const v = f[k];
  return v === undefined ? [] : typeof v === "string" ? [v] : v;
};

const has = (f: Fields, k: string) => f[k] !== undefined;

// ----- Proposals -----

// proposalFields reads whichever of the proposal's fields the form sent: the cover card and the
// terms card post to the same address with different fields.
export const proposalFields = (f: Fields, p: Pick<Proposal, keyof ProposalFields>): Partial<ProposalFields> => {
  const read: { [K in keyof ProposalFields]: [string, (v: string) => ProposalFields[K]] } = {
    title: ["title", (v) => text(v, 160) || p.title],
    subtitle: ["subtitle", (v) => text(v, 240)],
    client_name: ["client_name", (v) => text(v, 120)],
    client_company: ["client_company", (v) => text(v, 120)],
    client_email: ["client_email", (v) => text(v, 254).toLowerCase()],
    currency: ["currency", (v) => ((c) => (isCurrency(c) ? c : p.currency))(text(v, 3).toUpperCase())],
    tax_mode: ["tax_mode", (v) => asTaxMode(v, p.tax_mode)],
    gst_rate_bp: ["gst", (v) => percentBp(v, p.gst_rate_bp)],
    discount_bp: ["discount", (v) => percentBp(v, p.discount_bp)],
    deposit_bp: ["deposit", (v) => percentBp(v, p.deposit_bp)],
    expires_on: ["expires_on", (v) => (isDay(v) ? v : null)],
  };
  return Object.fromEntries(
    Object.entries(read).flatMap(([key, [field, fn]]) => (has(f, field) ? [[key, (fn as (v: string) => unknown)(one(f, field) ?? "")]] : [])),
  ) as Partial<ProposalFields>;
};

// ----- Items -----

export const blankItem = (pickOne: boolean): ItemInput => ({
  id: null,
  name: pickOne ? "New package" : "New item",
  description: "",
  unit_price: 0,
  quantity: 1,
  unit: "",
  mode: pickOne ? "optional" : "fixed",
  selected: false,
  recommended: false,
  qty_editable: false,
  qty_min: 1,
  qty_max: 10,
  recurring: "once",
});

export const fromPriceList = (x: PriceItem, pickOne: boolean): ItemInput => ({
  ...blankItem(pickOne),
  name: x.name,
  description: x.description,
  unit_price: x.unit_price,
  unit: x.unit,
  recurring: x.recurring,
});

const row = (f: Fields, n: number, pickOne: boolean): ItemInput => {
  const at = (k: string) => many(f, k)[n] ?? "";
  const id = Number(at("id"));
  const kind = at("kind");
  const clientQty = !pickOne && at("qtymode") === "client";
  const lo = intIn(at("qmin"), 0, 100000, 1);
  const hi = Math.max(lo, intIn(at("qmax"), 0, 100000, Math.max(lo, 10)));
  const qty = intIn(at("qty"), 0, 100000, 1);
  return {
    id: Number.isInteger(id) && id > 0 ? id : null,
    name: text(at("name"), 160),
    description: text(at("description"), 600),
    unit_price: Math.max(0, cents(at("price")) ?? 0),
    quantity: pickOne ? 1 : clientQty ? Math.min(hi, Math.max(lo, qty)) : qty,
    unit: text(at("unit"), 20),
    mode: pickOne || kind === "on" || kind === "off" ? "optional" : "fixed",
    selected: !pickOne && kind === "on",
    recommended: pickOne && kind === "recommended",
    qty_editable: clientQty,
    qty_min: clientQty ? lo : 1,
    qty_max: clientQty ? hi : 10,
    recurring: at("recurring") === "month" ? "month" : "once",
  };
};

// items reads a pricing section's rows (parallel fields, one value per row), drops the row
// whose remove button was pressed, keeps at most one recommended package, and adds a row when
// asked. A new row nobody named is left out.
export const items = (f: Fields, s: Pick<Section, "pick_one">, added?: PriceItem): ItemInput[] => {
  const remove = one(f, "remove");
  const rows = many(f, "name")
    .map((_, n) => row(f, n, s.pick_one))
    .filter((r, n) => String(n) !== remove && (r.id !== null || r.name !== ""));
  const firstRecommended = rows.findIndex((r) => r.recommended);
  const kept = rows.map((r, n) => (r.recommended && n !== firstRecommended ? { ...r, recommended: false } : r));
  const add = one(f, "add");
  return add === "blank" ? [...kept, blankItem(s.pick_one)] : add === "list" && added ? [...kept, fromPriceList(added, s.pick_one)] : kept;
};

// ----- Sections -----

export type NewKind = "text" | "pricing" | "packages" | "image";
export const isNewKind = (v: unknown): v is NewKind => v === "text" || v === "pricing" || v === "packages" || v === "image";

export const newSection = (k: NewKind): Pick<Section, "kind" | "heading" | "body" | "pick_one"> =>
  k === "packages"
    ? { kind: "pricing", heading: "Choose your package", body: "", pick_one: true }
    : k === "pricing"
      ? { kind: "pricing", heading: "Investment", body: "", pick_one: false }
      : k === "image"
        ? { kind: "image", heading: "", body: "", pick_one: false }
        : { kind: "text", heading: "", body: "", pick_one: false };

export const sectionFields = (f: Fields, s: Pick<Section, "kind">) => ({
  ...(has(f, "heading") ? { heading: text(one(f, "heading"), 160) } : {}),
  ...(has(f, "body") ? { body: text(one(f, "body"), s.kind === "text" ? 20000 : 300) } : {}),
});

// ----- Price list -----

export const priceFields = (f: Fields): Omit<PriceItem, "id"> | null => {
  const name = text(one(f, "name"), 160);
  const price = cents(one(f, "price"));
  if (!name || price === null || price < 0) return null;
  return { name, description: text(one(f, "description"), 600), unit_price: price, unit: text(one(f, "unit"), 20), recurring: one(f, "recurring") === "month" ? "month" : "once" };
};

// ----- Settings -----

// settingsFields reads the settings form. In the demo the sending address and the webhook stay
// as they are, so a visitor cannot point the demo at someone else.
export const settingsFields = (f: Fields, s: Settings, demo: boolean): Partial<Settings> => {
  const currency = text(one(f, "currency"), 3).toUpperCase();
  const accent = text(one(f, "accent"), 7);
  return {
    business_name: text(one(f, "business_name"), 120) || s.business_name,
    accent: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent.toLowerCase() : s.accent,
    currency: isCurrency(currency) ? currency : s.currency,
    tax_mode: asTaxMode(one(f, "tax_mode"), s.tax_mode),
    gst_rate_bp: percentBp(one(f, "gst"), s.gst_rate_bp),
    valid_days: intIn(one(f, "valid_days"), 1, 365, s.valid_days),
    email_on: one(f, "email_on") === "1",
    notify_email: text(one(f, "notify_email"), 254).toLowerCase(),
    ...(demo ? {} : { email_from: text(one(f, "email_from"), 254).toLowerCase(), webhook_url: text(one(f, "webhook_url"), 500) }),
  };
};

// The starting point of a new proposal: the business's defaults, valid for its usual days.
export const blankProposal = (s: Settings, today: string, addDays: (d: string, n: number) => string): ProposalFields => ({
  title: "Untitled proposal",
  subtitle: "",
  client_name: "",
  client_company: "",
  client_email: "",
  currency: s.currency,
  tax_mode: s.tax_mode,
  gst_rate_bp: s.gst_rate_bp,
  discount_bp: 0,
  deposit_bp: 0,
  expires_on: addDays(today, s.valid_days),
});

export type { Item };
