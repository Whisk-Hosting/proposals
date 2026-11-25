// What happens after something changes: emails to people and webhook calls to other systems.
// Each is written down first (emails, deliveries) and then handed to the platform queue, so a
// slow send or a receiver that is down never holds up a page, and failures retry. Where no
// queue runs (a preview, a plain local run) the work runs once in the background. In the demo
// nothing leaves the app: it is recorded and marked "demo".
import { randomUUID } from "node:crypto";
import { isDemo } from "./demo.js";
import type { Mail } from "./emails.js";
import { webhookSignature, type WebhookEvent } from "./model.js";
import * as store from "./store.js";
import { enqueue, isPreview, log, queueAvailable, whiskApi } from "./whisk.js";

const dispatch = async (name: string, data: Record<string, unknown>, dedupe: string, run: () => Promise<void>) => {
  const inline = () => void run().catch((err) => log.warn({ err: String(err), name }, "background work failed"));
  if (!queueAvailable() || isPreview()) return inline();
  try {
    await enqueue(name, data, dedupe);
  } catch (err) {
    log.warn({ err: String(err), name }, "queue refused the event; running it now");
    inline();
  }
};

// ----- Email -----

// The business's own address when set; otherwise Whisk sends from the app's address.
const fromHeader = (s: store.Settings) => (s.email_from ? `"${s.business_name.replace(/["\\\r\n]/g, "")}" <${s.email_from}>` : undefined);

// email records a message and sends it in the background. It never fails the caller.
export const email = async (kind: string, m: Mail) => {
  try {
    if (!m.to) return;
    const id = await store.queueEmail({ kind, ...m });
    const s = await store.settings();
    if (isDemo()) return void (await store.markEmail(id, "demo"));
    if (!s.email_on) return void (await store.markEmail(id, "skipped", "Email is off."));
    await dispatch("email.send", { email_id: id }, `email-${id}`, () => sendEmailNow(id));
  } catch (err) {
    log.error({ err: String(err), kind }, "could not queue an email");
  }
};

// sendEmailNow sends one recorded message. It throws on failure so the queue retries; the
// function's failure handler marks the last failure.
export const sendEmailNow = async (id: number, last = true) => {
  const e = await store.emailById(id);
  if (!e || e.status !== "pending") return;
  try {
    const s = await store.settings();
    await whiskApi("/email/send", { to: e.to_email, subject: e.subject, html: e.html, text: e.text, from: fromHeader(s), reply_to: e.reply_to || undefined });
    await store.markEmail(id, "sent");
  } catch (err) {
    if (last) await store.markEmail(id, "failed", String((err as Error).message ?? err));
    throw err;
  }
};

// ----- Webhooks -----

// emit records a delivery to the business's webhook, if it has one, and queues it.
export const emit = async (event: WebhookEvent | "ping", data: Record<string, unknown>) => {
  try {
    const s = await store.settings();
    if (!s.webhook_url) return;
    const payload = { id: `evt_${randomUUID()}`, type: event, created_at: new Date().toISOString(), data };
    const id = await store.recordDelivery(event, s.webhook_url, payload, isDemo() ? "demo" : "pending");
    if (isDemo()) return;
    await dispatch("webhook.deliver", { delivery_id: id }, `delivery-${id}`, () => deliverWebhookNow(id));
  } catch (err) {
    log.error({ err: String(err), event }, "could not queue a webhook");
  }
};

// deliverWebhookNow posts one delivery, signed with the business's webhook secret. Anything
// but a 2xx answer throws, so the queue retries with backoff; redirects are not followed.
export const deliverWebhookNow = async (id: number) => {
  const d = await store.deliveryById(id);
  if (!d || d.status !== "pending") return;
  const { webhook_secret } = await store.settings();
  const body = JSON.stringify(d.payload);
  const t = Math.floor(Date.now() / 1000);
  let status: number | null = null;
  let error = "";
  try {
    const res = await fetch(d.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        "user-agent": "proposals-webhooks/1",
        "webhook-id": String((d.payload as { id?: string }).id ?? id),
        "webhook-event": d.event,
        "webhook-signature": webhookSignature(webhook_secret, t, body),
      },
      body,
    });
    status = res.status;
    if (!res.ok) error = `The receiver answered ${res.status}.`;
    await res.body?.cancel().catch(() => undefined);
  } catch (err) {
    error = (err as Error).name === "TimeoutError" ? "No answer within 10 seconds." : `Could not connect: ${(err as Error).message}`;
  }
  await store.deliveryAttempt(id, status, error);
  if (error) throw new Error(error);
};
