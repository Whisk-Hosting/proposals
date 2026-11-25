// Small helpers every page route shares: who is asking, rendering inside the layout, reading
// form fields and ids, and short messages after a redirect.
import type { Context } from "hono";
import { guestFor } from "./demo.js";
import * as store from "./store.js";
import { layout, type Html, type Tab } from "./views/layout.js";
import { message } from "./views/parts.js";
import { identity, type Identity } from "./whisk.js";

export const who = (c: Context): Identity => guestFor(c, identity((n) => c.req.header(n)));

export const actor = (id: Identity) => id.name?.trim() || id.email || "Someone";

export const render = async (c: Context, title: string, body: Html, opts: { tab?: Tab; status?: 200 | 400 | 403 | 404 | 409 } = {}) =>
  c.html(layout({ s: await store.settings(), id: who(c), title, tab: opts.tab, body, unanswered: await store.unansweredCount() }), opts.status ?? 200);

export const notFound = (c: Context, what = "page") =>
  render(c, "Not found", message(`No such ${what}`, "", { href: "/", label: "All proposals" }), { status: 404 });

export const idParam = (c: Context, name = "id") => {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : 0;
};

export const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : 0;
};

// Messages shown after a redirect, by key, so no text travels in the address.
const flashes: Record<string, string> = {
  saved: "Saved.",
  sent: "Sent.",
  marked: "Marked as sent. Copy the link and send it yourself.",
  draft: "Back to draft. The link shows it as not ready until you send it again.",
  copied: "Copy made.",
  template: "Saved as a template.",
  answered: "Answer sent.",
  followed: "Follow-up sent.",
  deleted: "Deleted.",
  test: "Test sent. It shows below in a moment.",
  key_off: "Key turned off. Anything using it stops working now.",
};
export const flash = (c: Context) => flashes[c.req.query("ok") ?? ""];

// Form fields as plain strings; a field sent twice keeps its last value.
export const form = async (c: Context): Promise<Record<string, string>> => {
  const body = await c.req.parseBody({ all: true });
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(Array.isArray(v) ? v[v.length - 1] : v)]));
};

// A picture stored with Whisk, at a width: Whisk resizes it and serves it from the app's own
// address. On a laptop without Whisk, the original from the local stand-in.
export const img = (uploadId: string, w: number) =>
  process.env.WHISK_DEV === "1" && !process.env.WHISK_QUEUE_URL ? `/.dev/storage/${encodeURIComponent(uploadId)}` : `/.whisk/img/${encodeURIComponent(uploadId)}?w=${w}`;

export const baseUrl = () => (process.env.WHISK_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/$/, "");
export const clientLink = (token: string) => `${baseUrl()}/p/${token}`;
