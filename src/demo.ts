// Demo mode, for the public live demo only (demo/whisk.yaml sets DEMO=1). Everything about it
// is in this file: delete it, and the two lines that use it in index.ts and web.ts, and the app
// has no demo at all. Without DEMO=1 every route here answers 404 and the guest cookie means
// nothing, so a business's own copy keeps its pages private.
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { log, type Identity } from "./whisk.js";

export const isDemo = () => process.env.DEMO === "1";

const COOKIE = "guest";

// A visitor who pressed "Look around" acts as an admin of the business, so every screen can be
// tried. A real signed-in person always wins over the cookie.
export const guestFor = (c: Context, id: Identity): Identity =>
  isDemo() && id.audience === "anonymous" && getCookie(c, COOKIE) === "1"
    ? { ...id, audience: "team", userId: "demo-guest", email: "guest@example.com", name: "Guest", roles: ["admin"], groups: [] }
    : id;

export const demoRoutes = (app: Hono) => {
  app.post("/demo/start", (c) => {
    if (!isDemo()) return c.notFound();
    setCookie(c, COOKIE, "1", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return c.redirect("/", 303);
  });
  app.post("/demo/leave", (c) => {
    if (!isDemo()) return c.notFound();
    deleteCookie(c, COOKIE, { path: "/", secure: true });
    return c.redirect("/", 303);
  });
};

// What an anonymous visitor to the demo sees: one button in, and a client's view of a sample.
export const landing = (business: string, sampleToken?: string) => html`<div class="wrap" style="max-width:560px;padding-top:12vh;padding-bottom:12vh">
  <div class="accept-card" style="margin:0"><div class="art grain"></div>
    <h2>${business}</h2>
    <p style="margin:0 0 22px;opacity:.85">Proposals and quotes</p>
    <form method="post" action="/demo/start" class="inline"><button class="btn primary big" type="submit">Look around</button></form>
    ${sampleToken ? html`<p style="margin:16px 0 0"><a href="/p/${sampleToken}" style="color:inherit">A client's view</a></p>` : ""}
  </div>
</div>`;

// demo-reset empties the app's tables and seeds them again every night. Registered only in the
// demo (see functions.ts), and declared only in demo/whisk.yaml.
export const resetDemo = async () => {
  if (!isDemo()) return { reset: false };
  const { emptyAll } = await import("./store.js");
  const { seed } = await import("./seed.js");
  await emptyAll();
  await seed();
  log.info("demo data reset");
  return { reset: true };
};
