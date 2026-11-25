import assert from "node:assert/strict";
import { test } from "node:test";
import { items, proposalFields } from "../src/editing.js";
import type { Proposal } from "../src/model.js";
import {
  acceptanceJson,
  keyFrom,
  looksLikeKey,
  pageOf,
  paginate,
  priceItemBody,
  proposalBody,
  proposalJson,
  sectionBody,
  sendBody,
  statusFilter,
  textBody,
} from "../src/requests.js";

const key = `prp_${"a".repeat(32)}`;
const headers = (h: Record<string, string>) => (n: string) => h[n];

test("keyFrom reads every place a key can be", () => {
  const basic = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
  const cases: [Record<string, string>, string | undefined, string][] = [
    [{ authorization: `Bearer ${key}` }, undefined, key],
    [{ authorization: `bearer  ${key} ` }, undefined, key],
    [{ authorization: basic }, undefined, key],
    [{ "x-api-key": key }, undefined, key],
    [{}, key, key],
    [{ authorization: `Bearer ${key}`, "x-api-key": "other" }, "third", key],
    [{}, undefined, ""],
  ];
  for (const [h, token, want] of cases) assert.equal(keyFrom(headers(h), token), want, JSON.stringify(h));
});

test("looksLikeKey", () => {
  const cases: [string, boolean][] = [[key, true], [`prp_${"a".repeat(31)}`, false], [`sp_${"a".repeat(32)}`, false], [`prp_${"a".repeat(31)}'`, false], ["", false]];
  for (const [k, want] of cases) assert.equal(looksLikeKey(k), want, k);
});

test("pageOf and paginate", () => {
  const cases: [string | undefined, string | undefined, string][] = [
    [undefined, undefined, "25/0"],
    ["10", "20", "10/20"],
    ["0", undefined, "LIMIT_INVALID"],
    ["101", undefined, "LIMIT_INVALID"],
    ["2.5", undefined, "LIMIT_INVALID"],
    ["5", "-1", "OFFSET_INVALID"],
    ["5", "x", "OFFSET_INVALID"],
  ];
  for (const [l, o, want] of cases) {
    const r = pageOf(l, o);
    assert.equal(r.ok ? `${r.value.limit}/${r.value.offset}` : r.problem.code, want, `${l} ${o}`);
  }
  const list = [1, 2, 3, 4, 5];
  assert.deepEqual(paginate(list, { limit: 2, offset: 0 }), { items: [1, 2], total: 5, next_offset: 2 });
  assert.deepEqual(paginate(list, { limit: 2, offset: 4 }), { items: [5], total: 5, next_offset: null });
  assert.deepEqual(paginate(list, { limit: 10, offset: 9 }), { items: [], total: 5, next_offset: null });
});

test("statusFilter", () => {
  const cases: [string | undefined, string][] = [[undefined, "none"], ["", "none"], ["viewed", "viewed"], ["expired", "expired"], ["open", "STATUS_INVALID"]];
  for (const [v, want] of cases) {
    const r = statusFilter(v);
    assert.equal(r.ok ? (r.value ?? "none") : r.problem.code, want, String(v));
  }
});

const p = {
  title: "Old", subtitle: "", client_name: "", client_company: "", client_email: "", currency: "USD", tax_mode: "exclusive", gst_rate_bp: 800, discount_bp: 0, deposit_bp: 0, expires_on: "2026-11-01",
} as Proposal;

test("proposalBody checks fields and the editor reads them", () => {
  const cases: [Record<string, unknown>, string | Record<string, unknown>][] = [
    [{}, {}],
    [{ title: "Website", client: { name: "Ana", email: "Ana@Example.com" } }, { title: "Website", client_name: "Ana", client_email: "ana@example.com" }],
    [{ tax_rate: 8.5, discount: 10, deposit: 50, currency: "eur" }, { gst_rate_bp: 850, discount_bp: 1000, deposit_bp: 5000, currency: "EUR" }],
    [{ expires_on: null }, { expires_on: null }],
    [{ expires_on: "2026-12-01", tax_mode: "inclusive" }, { expires_on: "2026-12-01", tax_mode: "inclusive" }],
    [{ title: "" }, "title must be text of 1 to 160 characters."],
    [{ client: "Ana" }, "client must be an object: {name, company, email}."],
    [{ client: { email: "nope" } }, "client.email is not an email address."],
    [{ tax_rate: 120 }, "tax_rate must be a percentage from 0 to 100."],
    [{ discount: "10" }, "discount must be a percentage from 0 to 100."],
    [{ tax_mode: "plus" }, "tax_mode must be one of exclusive, inclusive, none."],
    [{ expires_on: "2026-02-30" }, "expires_on must be a date, YYYY-MM-DD, or null."],
    [{ currency: "dollars" }, "currency must be a three-letter code, like USD."],
  ];
  for (const [b, want] of cases) {
    const r = proposalBody(b);
    if (typeof want === "string") assert.equal(r.ok ? "ok" : r.problem.message, want, JSON.stringify(b));
    else {
      assert.ok(r.ok, JSON.stringify(b));
      if (r.ok) assert.deepEqual(proposalFields(r.value, p), want, JSON.stringify(b));
    }
  }
});

test("sectionBody turns items into the editor's rows", () => {
  const pricing = { kind: "pricing" as const, pick_one: false };
  const r = sectionBody(
    {
      heading: "Investment",
      items: [
        { id: 7, name: "Design", unit_price_cents: 250050, quantity: 2 },
        { name: "Hosting", unit_price_cents: 4500, mode: "optional", selected: false, recurring: "month" },
        { name: "Pages", unit_price_cents: 18000, quantity: 3, client_quantity: { min: 2, max: 5 }, unit: "page" },
      ],
    },
    pricing,
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.value.fields, { heading: "Investment" });
  const rows = items(r.value.items!, pricing);
  assert.deepEqual(
    rows.map((i) => [i.id, i.name, i.unit_price, i.quantity, i.mode, i.selected, i.qty_editable, i.qty_min, i.qty_max, i.recurring, i.unit]),
    [
      [7, "Design", 250050, 2, "fixed", false, false, 1, 10, "once", ""],
      [null, "Hosting", 4500, 1, "optional", false, false, 1, 10, "month", ""],
      [null, "Pages", 18000, 3, "fixed", false, true, 2, 5, "once", "page"],
    ],
  );
  const packages = { kind: "pricing" as const, pick_one: true };
  const pk = sectionBody({ items: [{ name: "A", unit_price_cents: 100 }, { name: "B", unit_price_cents: 200, recommended: true }, { name: "C", unit_price_cents: 300, recommended: true }] }, packages);
  assert.ok(pk.ok);
  if (pk.ok) assert.deepEqual(items(pk.value.items!, packages).map((i) => [i.mode, i.recommended]), [["optional", false], ["optional", true], ["optional", false]]);
  const headOnly = sectionBody({ heading: "Hi" }, pricing);
  assert.deepEqual(headOnly.ok && headOnly.value, { fields: { heading: "Hi" }, items: null });

  const bad: [Record<string, unknown>, { kind: "text" | "pricing"; pick_one: boolean }, string][] = [
    [{ items: [] }, { kind: "text", pick_one: false }, "SECTION_INVALID"],
    [{ items: {} }, pricing, "SECTION_INVALID"],
    [{ heading: 5 }, pricing, "SECTION_INVALID"],
    [{ items: [{ name: "X" }] }, pricing, "ITEM_INVALID"],
    [{ items: [{ name: "X", unit_price_cents: 1.5 }] }, pricing, "ITEM_INVALID"],
    [{ items: [{ name: "", unit_price_cents: 1 }] }, pricing, "ITEM_INVALID"],
    [{ items: [{ name: "X", unit_price_cents: 1, client_quantity: { min: 5, max: 2 } }] }, pricing, "ITEM_INVALID"],
    [{ items: [{ name: "X", unit_price_cents: 1, recurring: "year" }] }, pricing, "ITEM_INVALID"],
  ];
  for (const [b, s, want] of bad) {
    const x = sectionBody(b, s);
    assert.equal(x.ok ? "ok" : x.problem.code, want, JSON.stringify(b));
  }
});

test("priceItemBody merges over the item it changes", () => {
  const was = { name: "Workshop", description: "", unit_price: 180000, unit: "day", recurring: "once" };
  const cases: [Record<string, unknown>, typeof was | undefined, string | Record<string, string>][] = [
    [{ name: "Audit", unit_price_cents: 95000 }, undefined, { name: "Audit", description: "", price: "950", unit: "", recurring: "once" }],
    [{ unit_price_cents: 190050 }, was, { name: "Workshop", description: "", price: "1900.50", unit: "day", recurring: "once" }],
    [{ recurring: "month" }, was, { name: "Workshop", description: "", price: "1800", unit: "day", recurring: "month" }],
    [{ name: "Audit" }, undefined, "unit_price_cents must be a whole number of cents, 0 or more."],
    [{ unit_price_cents: 100 }, undefined, "name must be text of 1 to 160 characters."],
    [{ unit_price_cents: -1 }, was, "unit_price_cents must be a whole number of cents, 0 or more."],
    [{ recurring: "yearly" }, was, "recurring must be once or month."],
  ];
  for (const [b, w, want] of cases) {
    const r = priceItemBody(b, w);
    assert.deepEqual(r.ok ? r.value : r.problem.message, want, JSON.stringify(b));
  }
});

test("sendBody", () => {
  const cases: [Record<string, unknown>, string, string][] = [
    [{}, "ana@example.com", "email ana@example.com"],
    [{ client: { email: "Bo@Example.com", name: "Bo" } }, "", "email bo@example.com"],
    [{ how: "link" }, "", "link -"],
    [{}, "", "Sending by email needs the client's email address."],
    [{ how: "fax" }, "ana@example.com", "how must be email or link."],
    [{ client: { email: "bad" } }, "ana@example.com", "client.email is not an email address."],
  ];
  for (const [b, has, want] of cases) {
    const r = sendBody(b, { client_email: has });
    assert.equal(r.ok ? `${r.value.how} ${r.value.client_email ?? (r.value.how === "email" ? has : "-")}` : r.problem.message, want, JSON.stringify(b));
  }
});

test("textBody", () => {
  const cases: [Record<string, unknown>, boolean, string][] = [[{ answer: " Yes " }, true, "Yes"], [{}, false, ""], [{}, true, "ANSWER_INVALID"], [{ answer: "  " }, true, "ANSWER_INVALID"], [{ answer: 3 }, false, "ANSWER_INVALID"]];
  for (const [b, required, want] of cases) {
    const r = textBody(b, "answer", 10, required, "ANSWER_INVALID");
    assert.equal(r.ok ? r.value : r.problem.code, want, JSON.stringify(b));
  }
});

test("proposalJson shows the status the screens show", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const base = { ...p, id: 3, token: "t", status: "sent", is_template: false, first_viewed_at: null, view_count: 0, value_cents: 100, owner_name: "", owner_email: "", created_at: now, updated_at: now, sent_at: now, last_viewed_at: null, decided_at: null, decline_reason: "x" } as Proposal;
  const cases: [Partial<Proposal>, string][] = [
    [{}, "sent"],
    [{ first_viewed_at: now }, "viewed"],
    [{ expires_on: "2026-10-01" }, "expired"],
    [{ is_template: true }, "template"],
  ];
  for (const [over, want] of cases) assert.equal(proposalJson({ ...base, ...over }, now, "https://x/p/t").status, want);
  const j = proposalJson(base, now, "https://x/p/t");
  assert.equal(j.tax_rate, 8);
  assert.equal(j.decline_reason, null);
  assert.equal(j.share_url, "https://x/p/t");
});

test("acceptanceJson hides a drawn signature's strokes and names money in cents", () => {
  const line = { item_id: 1, section_id: 2, name: "Design", quantity: 1, unit: "", unit_price: 500, amount: 500, recurring: "once" as const };
  const totals = { subtotal: 500, discount: 0, tax: 40, total: 540 };
  const frozen = {
    doc: { brand: { business_name: "", accent: "", logo_upload_id: null }, proposal: { ...p, id: 3, cover_upload_id: null, owner_name: "", owner_email: "" }, sections: [] },
    selections: { optional: {}, picks: {}, quantities: { "1": 1 } },
    quote: { lines: [line], once: totals, month: { subtotal: 0, discount: 0, tax: 0, total: 0 }, deposit: 0 },
    acceptance: { name: "Ana", email: "ana@example.com", signature: { kind: "drawn" as const, path: "M0 0L1 1" }, ip: "1.2.3.4", user_agent: "x", accepted_at: "2026-10-09T00:00:00.000Z" },
  };
  const j = acceptanceJson(3, { frozen, fingerprint: "f", created_at: new Date() }, "https://x/p/t/pdf");
  assert.deepEqual(j.signature, { kind: "drawn" });
  assert.deepEqual(j.accepted_by, { name: "Ana", email: "ana@example.com" });
  assert.deepEqual(j.once, { subtotal_cents: 500, discount_cents: 0, tax_cents: 40, total_cents: 540 });
  assert.equal(j.lines[0].amount_cents, 500);
});
