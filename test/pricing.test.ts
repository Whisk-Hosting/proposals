import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSelections, headline, missingChoices, money, normalise, quote, taxOn, type Item, type Section, type Terms } from "../src/pricing.js";

const item = (id: number, over: Partial<Item> = {}): Item => ({
  id, name: `Item ${id}`, description: "", unit_price: 10000, quantity: 1, unit: "", mode: "fixed", selected: false, recommended: false,
  qty_editable: false, qty_min: 1, qty_max: 10, recurring: "once", ...over,
});
const sec = (id: number, items: Item[], pick_one = false): Section => ({ id, kind: "pricing", heading: "", body: "", image_upload_id: null, pick_one, items });
const terms: Terms = { currency: "USD", tax_mode: "exclusive", gst_rate_bp: 1500, discount_bp: 0, deposit_bp: 0 };

const sections = [
  sec(1, [item(11, { unit_price: 680000 }), item(12, { unit_price: 1140000, recommended: true })], true),
  sec(2, [item(21), item(22, { mode: "optional", selected: true }), item(23, { mode: "optional", unit_price: 18000, qty_editable: true, qty_min: 2, qty_max: 5, quantity: 3 })]),
  sec(3, [item(31, { unit_price: 14500, recurring: "month" })]),
];

test("taxOn", () => {
  const cases: [number, Terms["tax_mode"], number, number][] = [
    [10000, "exclusive", 1500, 1500],
    [11500, "inclusive", 1500, 1500],
    [10000, "none", 1500, 0],
    [333, "exclusive", 1500, 50],
  ];
  for (const [net, mode, bp, want] of cases) assert.equal(taxOn(net, { tax_mode: mode, gst_rate_bp: bp }), want, `${net} ${mode}`);
});

test("defaults pick the recommended package and ticked extras", () => {
  const s = defaultSelections(sections);
  assert.equal(s.picks["1"], 12);
  assert.equal(s.optional["22"], true);
  assert.equal(s.optional["23"], false);
});

test("quote", () => {
  const cases: { name: string; sel: unknown; t?: Partial<Terms>; once: number; month: number; deposit?: number }[] = [
    { name: "defaults", sel: {}, once: Math.round((1140000 + 10000 + 10000) * 1.15), month: Math.round(14500 * 1.15) },
    { name: "other package, extra at 4", sel: { picks: { 1: 11 }, optional: { 22: false, 23: true }, quantities: { 23: 4 } }, once: Math.round((680000 + 10000 + 72000) * 1.15), month: 16675 },
    { name: "quantity clamped to max", sel: { optional: { 23: true }, quantities: { 23: 99 } }, once: Math.round((1140000 + 20000 + 90000) * 1.15), month: 16675 },
    { name: "10% off, no tax, 30% deposit", sel: {}, t: { discount_bp: 1000, tax_mode: "none", deposit_bp: 3000 }, once: 1044000, month: 13050, deposit: 313200 },
    { name: "unknown ids ignored", sel: { picks: { 1: 999 }, optional: { 999: true } }, once: Math.round(1160000 * 1.15), month: 16675 },
  ];
  for (const c of cases) {
    const t = { ...terms, ...c.t };
    const q = quote(sections, normalise(sections, c.sel), t);
    assert.equal(q.once.total, c.once, c.name);
    assert.equal(q.month.total, c.month, c.name);
    if (c.deposit !== undefined) assert.equal(q.deposit, c.deposit, c.name);
  }
});

test("a package section with no default must be chosen", () => {
  const s = [sec(1, [item(11), item(12)], true)];
  assert.equal(missingChoices(s, normalise(s, {})).length, 1);
  assert.equal(missingChoices(s, normalise(s, { picks: { 1: 12 } })).length, 0);
});

test("money and headline", () => {
  assert.equal(money(906200, "USD"), "$9,062");
  assert.equal(money(16675, "USD"), "$166.75");
  const q = quote(sections, defaultSelections(sections), terms);
  assert.deepEqual(headline(q, terms), { main: money(q.once.total, "USD"), sub: `incl. tax · + ${money(16675, "USD")} / month` });
});
