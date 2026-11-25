// The app's background functions. Step names match workflows/*.graph.yaml.
import { isDemo, resetDemo } from "./demo.js";
import { deliverWebhookNow, sendEmailNow } from "./events.js";
import * as store from "./store.js";
import { inngest } from "./whisk.js";

type Failure = { event: { data: { event: { data: Record<string, unknown> } } }; error: Error };

export const sendEmail = inngest.createFunction(
  {
    id: "send-email",
    triggers: [{ event: "email.send" }],
    retries: 4,
    throttle: { limit: 60, period: "1m" },
    onFailure: async ({ event, error }: Failure) => {
      await store.markEmail(Number(event.data.event.data.email_id), "failed", error.message);
    },
  },
  async ({ event, step }) => step.run("send", () => sendEmailNow(Number(event.data.email_id), false)),
);

export const deliverWebhook = inngest.createFunction(
  {
    id: "deliver-webhook",
    triggers: [{ event: "webhook.deliver" }],
    retries: 8,
    concurrency: { limit: 5 },
    onFailure: async ({ event }: Failure) => {
      await store.deliveryFailed(Number(event.data.event.data.delivery_id));
    },
  },
  async ({ event, step }) => step.run("deliver", () => deliverWebhookNow(Number(event.data.delivery_id))),
);

// Only the live demo has this one (demo/whisk.yaml declares it): fresh sample data every night.
const resetStep = "reset";
const demoReset = inngest.createFunction({ id: "demo-reset", triggers: [{ cron: "0 3 * * *" }] }, async ({ step }) => step.run(resetStep, resetDemo));

export const functions = isDemo() ? [sendEmail, deliverWebhook, demoReset] : [sendEmail, deliverWebhook];
