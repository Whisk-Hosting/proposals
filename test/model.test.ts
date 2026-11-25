import assert from "node:assert/strict";
import { test } from "node:test";
import { canonical, cents, csv, followUp, isPublicUrl, percentBp, shownStatus, strokesToPath, webhookSignature } from "../src/model.js";
import { items } from "../src/editing.js";

const now = new Date("2026-10-09T00:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3600000);

test("shownStatus", () => {
  const cases: [Parameters<typeof shownStatus>[0], string][] = [
    [{ status: "draft", expires_on: null, first_viewed_at: null }, "draft"],
    [{ status: "sent", expires_on: "2026-10-20", first_viewed_at: null }, "sent"],
    [{ status: "sent", expires_on: "2026-10-20", first_viewed_at: h(1) }, "viewed"],
    [{ status: "sent", expires_on: "2026-10-01", first_viewed_at: h(1) }, "expired"],
    [{ status: "accepted", expires_on: "2026-10-01", first_viewed_at: h(1) }, "accepted"],
  ];
  for (const [p, want] of cases) assert.equal(shownStatus(p, now), want);
});

test("followUp", () => {
  const base = { status: "sent", expires_on: "2026-11-01", sent_at: h(30), first_viewed_at: null, followed_up_at: null, is_template: false };
  const cases: [Record<string, unknown>, string | null][] = [
    [{}, "not_opened"],
    [{ sent_at: h(5) }, null],
    [{ first_viewed_at: h(2) }, null],
    [{ first_viewed_at: h(2), sent_at: h(80) }, "not_accepted"],
    [{ expires_on: "2026-10-11", sent_at: h(5) }, "expiring"],
    [{ followed_up_at: h(10) }, null],
    [{ status: "draft" }, null],
  ];
  for (const [over, want] of cases) assert.equal(followUp({ ...base, ...over } as never, now), want, JSON.stringify(over));
});

test("reading money and percentages", () => {
  const money: [unknown, number | null][] = [["1,250.50", 125050], ["$1250", 125000], ["12.5", 1250], ["abc", null], ["1.234", null]];
  for (const [v, want] of money) assert.equal(cents(v), want, String(v));
  const pct: [unknown, number][] = [["15", 1500], ["12.5%", 1250], ["", 900], ["150", 10000], ["-3", 0]];
  for (const [v, want] of pct) assert.equal(percentBp(v, 900), want, String(v));
});

test("signatures are paths of numbers only", () => {
  const stroke = [[0, 0], [10, 10], [20, 5], [30, 15], [40, 0], [50, 9]];
  assert.equal(strokesToPath([stroke]), "M0 0L10 10L20 5L30 15L40 0L50 9");
  assert.equal(strokesToPath([[[0, 0]]]), null);
  assert.equal(strokesToPath([[["<x>", 1], ...stroke]]), "M0 0L10 10L20 5L30 15L40 0L50 9");
  assert.equal(strokesToPath([[[-5, 900], ...stroke]])?.startsWith("M0 300"), true);
});

test("webhook URLs must be public https", () => {
  const cases: [string, boolean][] = [["https://hooks.example.com/x", true], ["http://example.com", false], ["https://localhost/x", false], ["https://10.0.0.1/x", false], ["https://api.whisk", false]];
  for (const [u, want] of cases) assert.equal(isPublicUrl(u), want, u);
});

test("canonical JSON sorts keys and signatures match", () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
  assert.match(webhookSignature("s", 1, "{}"), /^t=1,v1=[0-9a-f]{64}$/);
});

test("csv quotes formulas", () => {
  assert.equal(csv(["a"], [["=SUM(1)"], ['x,"y"']]), "a\r\n'=SUM(1)\r\n\"x,\"\"y\"\"\"\r\n");
});

test("editor rows", () => {
  const f = { id: ["5", ""], name: ["Design", ""], price: ["1,200", "0"], qty: ["2", "1"], unit: ["hour", ""], description: ["", ""], kind: ["off", "fixed"], recurring: ["once", "once"], qtymode: ["client", "fixed"], qmin: ["3", "1"], qmax: ["1", "10"] };
  const rows = items(f, { pick_one: false });
  assert.equal(rows.length, 1, "unnamed new row dropped");
  assert.deepEqual({ id: rows[0].id, price: rows[0].unit_price, mode: rows[0].mode, lo: rows[0].qty_min, hi: rows[0].qty_max, qty: rows[0].quantity }, { id: 5, price: 120000, mode: "optional", lo: 3, hi: 3, qty: 3 });
  assert.equal(items({ ...f, remove: "0" }, { pick_one: false }).length, 0);
  assert.equal(items({ ...f, add: "blank" }, { pick_one: false }).length, 2);
  const pk = items({ id: ["1", "2"], name: ["A", "B"], price: ["1", "2"], kind: ["recommended", "recommended"] }, { pick_one: true });
  assert.deepEqual(pk.map((r) => r.recommended), [true, false]);
});
