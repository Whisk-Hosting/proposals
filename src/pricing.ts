// The pricing rules, in one place: what the client picked, what each line costs, discount, tax,
// deposit and totals. Pure, with no imports, so the server and the proposal page's script run
// exactly the same code and the total the client sees is the total that is stored.
// Money is whole cents; rates are basis points (800 = 8%).

export type Recurring = "once" | "month";
export type Mode = "fixed" | "optional";
export type TaxMode = "exclusive" | "inclusive" | "none";

export type Item = {
  id: number;
  name: string;
  description: string;
  unit_price: number;
  quantity: number;
  unit: string;
  mode: Mode;
  // An optional item starts ticked; in a pick-one section, the package chosen to start with.
  selected: boolean;
  recommended: boolean;
  qty_editable: boolean;
  qty_min: number;
  qty_max: number;
  recurring: Recurring;
};

export type Section = {
  id: number;
  kind: "text" | "pricing" | "image";
  heading: string;
  body: string;
  image_upload_id: string | null;
  // A pick-one section shows its items as packages; the client chooses exactly one.
  pick_one: boolean;
  items: Item[];
};

export type Terms = {
  currency: string;
  tax_mode: TaxMode;
  gst_rate_bp: number;
  discount_bp: number;
  deposit_bp: number;
};

// What the client chose. Keys are ids as strings, so it survives a JSON round trip unchanged.
export type Selections = {
  optional: Readonly<Record<string, boolean>>;
  picks: Readonly<Record<string, number>>;
  quantities: Readonly<Record<string, number>>;
};

export type Line = { item_id: number; section_id: number; name: string; quantity: number; unit: string; unit_price: number; amount: number; recurring: Recurring };

export type Totals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

export type Quote = {
  lines: Line[];
  once: Totals;
  month: Totals;
  deposit: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const pricingSections = (sections: readonly Section[]) => sections.filter((s) => s.kind === "pricing");

// The package a pick-one section starts on: the one marked selected, else the recommended one,
// else none, so the client has to choose.
const defaultPick = (s: Section) => (s.items.find((i) => i.selected) ?? s.items.find((i) => i.recommended))?.id;

export const defaultSelections = (sections: readonly Section[]): Selections => {
  const ps = pricingSections(sections);
  const items = ps.flatMap((s) => (s.pick_one ? [] : s.items));
  return {
    optional: Object.fromEntries(items.filter((i) => i.mode === "optional").map((i) => [String(i.id), i.selected])),
    picks: Object.fromEntries(ps.filter((s) => s.pick_one).flatMap((s) => {
      const pick = defaultPick(s);
      return pick === undefined ? [] : [[String(s.id), pick]];
    })),
    quantities: Object.fromEntries(ps.flatMap((s) => s.items).map((i) => [String(i.id), i.quantity])),
  };
};

// qtyFor is the quantity that counts: the client's, when the item lets them change it and it is
// a whole number in range, else the author's.
export const qtyFor = (item: Item, sel: Selections) => {
  const asked = sel.quantities[String(item.id)];
  if (!item.qty_editable || typeof asked !== "number" || !Number.isFinite(asked)) return item.quantity;
  return clamp(Math.round(asked), item.qty_min, Math.max(item.qty_min, item.qty_max));
};

export const isIncluded = (s: Section, item: Item, sel: Selections) => {
  if (s.pick_one) return sel.picks[String(s.id)] === item.id;
  if (item.mode === "fixed") return true;
  const ticked = sel.optional[String(item.id)];
  return typeof ticked === "boolean" ? ticked : item.selected;
};

// normalise turns whatever arrived from a browser into selections that only name real items,
// with quantities in range. Unknown ids are dropped; missing choices fall back to defaults.
export const normalise = (sections: readonly Section[], raw: unknown): Selections => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Selections, unknown>>;
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const ps = pricingSections(sections);
  const base = defaultSelections(sections);
  const opt = obj(r.optional);
  const picks = obj(r.picks);
  const qty = obj(r.quantities);
  const optionalItems = ps.flatMap((s) => (s.pick_one ? [] : s.items.filter((i) => i.mode === "optional")));
  const allItems = ps.flatMap((s) => s.items);
  return {
    optional: Object.fromEntries(optionalItems.map((i) => [String(i.id), typeof opt[i.id] === "boolean" ? (opt[i.id] as boolean) : base.optional[String(i.id)]])),
    picks: Object.fromEntries(ps.filter((s) => s.pick_one).flatMap((s) => {
      const asked = Number(picks[s.id]);
      const pick = s.items.some((i) => i.id === asked) ? asked : base.picks[String(s.id)];
      return pick === undefined ? [] : [[String(s.id), pick]];
    })),
    quantities: Object.fromEntries(allItems.map((i) => [String(i.id), qtyFor(i, { ...base, quantities: { [i.id]: Number(qty[i.id]) } })])),
  };
};

// Tax on an amount that has had the discount taken off.
export const taxOn = (net: number, t: Pick<Terms, "tax_mode" | "gst_rate_bp">) => {
  if (t.tax_mode === "none" || t.gst_rate_bp <= 0) return 0;
  if (t.tax_mode === "exclusive") return Math.round((net * t.gst_rate_bp) / 10000);
  return Math.round((net * t.gst_rate_bp) / (10000 + t.gst_rate_bp));
};

const totalsFor = (lines: readonly Line[], t: Terms): Totals => {
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const discount = Math.round((subtotal * clamp(t.discount_bp, 0, 10000)) / 10000);
  const net = subtotal - discount;
  const tax = taxOn(net, t);
  return { subtotal, discount, tax, total: t.tax_mode === "exclusive" ? net + tax : net };
};

export const quote = (sections: readonly Section[], sel: Selections, t: Terms): Quote => {
  const lines: Line[] = pricingSections(sections).flatMap((s) =>
    s.items
      .filter((i) => isIncluded(s, i, sel))
      .map((i) => {
        const quantity = qtyFor(i, sel);
        return { item_id: i.id, section_id: s.id, name: i.name, quantity, unit: i.unit, unit_price: i.unit_price, amount: i.unit_price * quantity, recurring: i.recurring };
      }),
  );
  const once = totalsFor(lines.filter((l) => l.recurring === "once"), t);
  const month = totalsFor(lines.filter((l) => l.recurring === "month"), t);
  return { lines, once, month, deposit: Math.round((once.total * clamp(t.deposit_bp, 0, 10000)) / 10000) };
};

// What still stops the client accepting: a pick-one section with nothing chosen.
export const missingChoices = (sections: readonly Section[], sel: Selections): Section[] =>
  pricingSections(sections).filter((s) => s.pick_one && s.items.length > 0 && !s.items.some((i) => i.id === sel.picks[String(s.id)]));

export const money = (cents: number, currency: string) => {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
};

// Shown beside a line's price: "$120 / month", "$85 / hour".
export const per = (item: Pick<Item, "unit" | "recurring">) =>
  [item.unit && item.unit !== "each" ? item.unit : "", item.recurring === "month" ? "month" : ""].filter(Boolean).join(" / ");

// The small print under a line's amount: "6 × $180 / page", or "$145 / month" for one.
export const lineMeta = (item: Item, qty: number, currency: string) => {
  const unit = per(item);
  if (qty === 1 && !item.qty_editable) return unit ? `${money(item.unit_price, currency)} / ${unit}` : "";
  return `${qty} × ${money(item.unit_price, currency)}${unit ? ` / ${unit}` : ""}`;
};

// The one line that sums it up, for the sticky bar and the accept button:
// "$13,524" with "incl. tax · + $166.75 / month".
export const headline = (q: Quote, t: Terms) => {
  const hasMonth = q.month.subtotal > 0;
  const hasOnce = q.once.subtotal > 0 || !hasMonth;
  const main = money(hasOnce ? q.once.total : q.month.total, t.currency) + (hasOnce ? "" : " / month");
  const sub = [t.tax_mode === "none" ? "" : "incl. tax", hasOnce && hasMonth ? `+ ${money(q.month.total, t.currency)} / month` : ""].filter(Boolean).join(" · ");
  return { main, sub };
};
