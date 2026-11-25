import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { isDemo } from "../demo.js";
import { isColour } from "../model.js";
import type { Settings } from "../store.js";
import { canAdmin, isStaff, type Identity } from "../whisk.js";
import { icon } from "./icons.js";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;
export type Tab = "proposals" | "templates" | "prices" | "settings";

export const accentOf = (s: Pick<Settings, "accent">) => (isColour(s.accent) ? s.accent : "#1d6b57");

// Text on the accent colour: white on dark colours, near-black on light ones.
export const onAccent = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#14120f" : "#ffffff";
};

const head = (title: string, accent: string) => html`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preload" href="/assets/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/app.css?v=${raw(ASSET_VERSION)}">
<style>:root { --accent: ${raw(accent)}; --on-accent: ${raw(onAccent(accent))}; }</style>
<link rel="icon" href="data:image/svg+xml,${raw(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="4" fill="${accent}"/></svg>`))}">
<meta name="robots" content="noindex">`;

// Changes whenever the build does (build.mjs sets it), so browsers fetch new styles and
// scripts after a deploy.
declare const __BUILD__: string;
export const ASSET_VERSION = typeof __BUILD__ === "string" ? __BUILD__ : "dev";

const current = (on: boolean) => (on ? raw(' aria-current="page"') : "");

export const brandMark = (s: Pick<Settings, "business_name">) => html`<span class="brand-mark">${s.business_name.trim().charAt(0).toUpperCase() || "P"}</span>`;

const demoBar = (id: Identity) =>
  isDemo() && id.userId === "demo-guest"
    ? html`<div class="demo-bar"><div class="wrap"><span>Demo · resets every night</span><form class="inline" method="post" action="/demo/leave"><button class="link" type="submit">Leave</button></form></div></div>`
    : "";

// The staff pages: proposals, templates, price list, settings.
export const layout = ({ s, id, title, tab, body, unanswered }: { s: Settings; id: Identity; title: string; tab?: Tab; body: Html; unanswered: number }) => {
  const accent = accentOf(s);
  return html`<!doctype html>
<html lang="en-US">
<head>${head(title === s.business_name ? title : `${title} · ${s.business_name}`, accent)}
<script src="/assets/staff.js?v=${raw(ASSET_VERSION)}" defer></script>
</head>
<body${isDemo() ? raw(" data-demo") : ""}>
${demoBar(id)}
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">${brandMark(s)}<span>${s.business_name}</span></a>
    ${isStaff(id)
      ? html`<nav class="nav" aria-label="Main">
      <a href="/"${current(tab === "proposals")}>${icon.doc}<span class="label">Proposals</span>${unanswered > 0 ? html`<span class="count-pill" title="Questions to answer">${unanswered}</span>` : ""}</a>
      <a href="/templates"${current(tab === "templates")}>${icon.layers}<span class="label">Templates</span></a>
      <a href="/prices"${current(tab === "prices")}>${icon.tag}<span class="label">Price list</span></a>
      ${canAdmin(id) ? html`<a href="/settings"${current(tab === "settings")}>${icon.settings}<span class="label">Settings</span></a>` : ""}
      ${id.userId === "demo-guest" ? "" : html`<a href="/.whisk/logout?return=/" title="Signed in as ${id.email}">${icon.user}</a>`}
    </nav>`
      : ""}
  </div>
</header>
<main class="staff">${body}</main>
<footer class="site"><div class="wrap spread"><span>${s.business_name}</span><span>Runs on <a href="https://whisk.run">Whisk</a></span></div></footer>
</body>
</html>`;
};

// The proposal page the client sees: no staff navigation, the business's colour throughout.
export const docLayout = ({ title, accent, body, data }: { title: string; accent: string; body: Html; data: unknown }) => html`<!doctype html>
<html lang="en-US">
<head>${head(title, accent)}
<link rel="preload" href="/assets/fonts/caveat-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<script id="data" type="application/json">${raw(JSON.stringify(data).replace(/</g, "\\u003c"))}</script>
<script src="/assets/proposal.js?v=${raw(ASSET_VERSION)}" defer></script>
</head>
<body class="doc">${body}</body>
</html>`;
