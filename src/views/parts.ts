// Small pieces several pages draw.
import { html } from "hono/html";
import { statusLabel, type Shown } from "../model.js";
import { icon } from "./icons.js";

export const message = (title: string, text: string, link?: { href: string; label: string }) => html`<div class="wrap" style="padding-top:72px;padding-bottom:72px">
  <div class="empty"><h2>${title}</h2>${text ? html`<p>${text}</p>` : ""}${link ? html`<p><a class="btn" href="${link.href}">${link.label}</a></p>` : ""}</div>
</div>`;

export const notice = (kind: "good" | "error" | "", text?: string) => (text ? html`<div class="notice ${kind}" role="status">${text}</div>` : "");

const badgeKind: Record<Shown, string> = { draft: "", sent: "", viewed: "info", accepted: "good", declined: "bad", expired: "warn" };

export const statusBadge = (s: Shown) => html`<span class="badge dot ${badgeKind[s]}">${statusLabel[s]}</span>`;

// The cover art: the uploaded picture, or soft light drawn from the brand colour.
export const artStyle = (imageUrl: string | null) => (imageUrl ? `background-image:url("${imageUrl.replace(/["\\\n]/g, "")}")` : "");

export const kindIcon = (kind: string) => (kind === "pricing" ? icon.tag : kind === "image" ? icon.image : icon.text);
