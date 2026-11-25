import { serve as nodeServe } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { serve as inngestServe } from "inngest/hono";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { api } from "./api.js";
import { sql } from "./db.js";
import { demoRoutes, isDemo, landing } from "./demo.js";
import { functions } from "./functions.js";
import { clientRoutes } from "./routes/client.js";
import { staffRoutes } from "./routes/staff.js";
import * as store from "./store.js";
import { message } from "./views/parts.js";
import { css } from "./views/styles.js";
import { notFound, render, who } from "./web.js";
import { devStub, env, inngest, isStaff, log } from "./whisk.js";

if (process.env.SENTRY_DSN) {
  const Sentry = await import("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.WHISK_ENV });
}

const app = new Hono();

// Every request: one JSON log line with the request id.
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  const id = who(c);
  log.info({ request_id: id.requestId, method: c.req.method, path: c.req.path, status: c.res.status, audience: id.audience, ms: Date.now() - started }, "request");
});

app.get("/health", async (c) => {
  try {
    await sql`select 1`;
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 503);
  }
});

// ----- Styles, scripts and fonts, all served by the app itself -----

const dist = (p: string) => new URL(p, import.meta.url);
const scripts = { proposal: await readFile(dist("./public/proposal.js")), staff: await readFile(dist("./public/staff.js")) };
const fonts = new Map(
  await Promise.all(
    [
      "figtree-latin-wght-normal.woff2",
      "figtree-latin-ext-wght-normal.woff2",
      "figtree-latin-wght-italic.woff2",
      "jetbrains-mono-latin-400-normal.woff2",
      "jetbrains-mono-latin-600-normal.woff2",
      "caveat-latin-600-normal.woff2",
      "caveat-latin-ext-600-normal.woff2",
    ].map(async (f) => [f, await readFile(dist(`./fonts/${f}`))] as const),
  ),
);

// Asset addresses carry ?v=<build>, so they can be kept for a year.
const longCache = (c: Context) => c.header("Cache-Control", "public, max-age=31536000, immutable");
app.get("/assets/app.css", (c) => (longCache(c), c.body(css, 200, { "content-type": "text/css; charset=utf-8" })));
app.get("/assets/:name{(proposal|staff)\\.js}", (c) => {
  longCache(c);
  return c.body(new Uint8Array(scripts[c.req.param("name").replace(".js", "") as keyof typeof scripts]), 200, { "content-type": "text/javascript; charset=utf-8" });
});
app.get("/assets/fonts/:file", (c) => {
  const font = fonts.get(c.req.param("file"));
  if (!font) return c.notFound();
  longCache(c);
  return c.body(new Uint8Array(font), 200, { "content-type": "font/woff2" });
});

// Function runs arrive here from the platform with the service identity (queue.endpoint).
const inngestHandler = inngestServe({ client: inngest, functions });
app.on(["GET", "POST", "PUT"], "/.whisk/inngest", (c) => inngestHandler(c));

// On a laptop without Whisk, uploads land here (see devApi in whisk.ts).
if (devStub()) {
  const dir = "/tmp/proposals-dev-storage";
  await mkdir(dir, { recursive: true });
  const file = (id: string) => `${dir}/${id.replace(/[^A-Za-z0-9_-]/g, "")}`;
  app.post("/.dev/storage/:id", async (c) => {
    const form = await c.req.parseBody();
    if (!(form.file instanceof File)) return c.text("no file", 400);
    await writeFile(file(c.req.param("id")), new Uint8Array(await form.file.arrayBuffer()));
    return c.body(null, 204);
  });
  app.get("/.dev/storage/:id", async (c) => {
    const data = await readFile(file(c.req.param("id"))).catch(() => undefined);
    return data ? c.body(new Uint8Array(data), 200, { "content-type": "application/octet-stream" }) : c.notFound();
  });
}

demoRoutes(app);
clientRoutes(app);

// The JSON API checks its own keys (src/api.ts), so it sits ahead of the team's sign-in.
app.route("/api/v1", api);

// Everything else is for the business's team. In the app itself Whisk asks people to sign in
// before they get here; in the live demo, where every page is public, a visitor gets the card
// with the Look around button.
const open = ["/p/", "/assets/", "/health", "/demo/", "/.whisk/", "/.dev/", "/api/"];
app.use("*", async (c, next) => {
  if (open.some((p) => c.req.path.startsWith(p)) || isStaff(who(c))) return next();
  if (isDemo()) {
    if (c.req.method !== "GET") return c.redirect("/", 303);
    const sample = (await store.proposals(false)).find((p) => p.status === "sent");
    return render(c, (await store.settings()).business_name, landing((await store.settings()).business_name, sample?.token));
  }
  if (c.req.method === "GET") return c.redirect(`/.whisk/login?return=${encodeURIComponent(c.req.path)}`, 302);
  return render(c, "Sign in", message("Sign in to continue", "", { href: "/.whisk/login?return=/", label: "Sign in" }), { status: 403 });
});
staffRoutes(app);

app.notFound((c) =>
  c.req.path.startsWith("/api/") ? c.json({ error: { code: "NOT_FOUND", message: "There is no such API endpoint.", fix: "GET /api/v1 lists the endpoints." } }, 404) : notFound(c),
);

app.onError(async (err, c) => {
  log.error({ request_id: who(c).requestId, err: err.message, stack: err.stack }, "unhandled error");
  if (process.env.SENTRY_DSN) (await import("@sentry/node")).captureException(err);
  const ref = who(c).requestId.replace(/[^A-Za-z0-9_-]/g, "") || "none";
  if (c.req.path.startsWith("/api/") || c.req.header("accept")?.includes("json") || c.req.header("content-type")?.includes("json"))
    return c.json({ error: { code: "INTERNAL", message: "Something went wrong.", fix: `Try again. If it keeps happening, quote ${ref}.` } }, 500);
  return c.html(
    `<!doctype html><title>Something went wrong</title><body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem"><h1>Something went wrong</h1><p>Try again in a moment. If it keeps happening, quote this reference: ${ref}.</p><p><a href="/">Back</a></p></body>`,
    500,
  );
});

const server = nodeServe({ fetch: app.fetch, port: Number(env("PORT", "8080")), hostname: "0.0.0.0" }, (info) => log.info({ port: info.port }, "listening"));

// SIGTERM: stop accepting, finish in-flight requests, close the pool, exit within the grace period.
const shutdown = () => {
  log.info("shutting down");
  server.close(async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), (Number(process.env.WHISK_STOP_GRACE ?? 28) - 2) * 1000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
