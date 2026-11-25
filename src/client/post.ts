// Sending to the app from a page. Public writes (accepting, asking, counting a view, and every
// write in the live demo) are challenge routes: Whisk's edge answers the first try with 403
// CHALLENGE_REQUIRED and a proof-of-work puzzle, which this solves (sha256(salt + n) for n up to
// maxnumber) and resends in the X-Altcha header. Posts that are not challenged go straight through.

type Challenge = { algorithm: string; challenge: string; salt: string; signature: string; maxnumber: number };

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const solve = async (c: Challenge): Promise<string | null> => {
  const enc = new TextEncoder();
  for (let start = 0; start <= c.maxnumber; start += 500) {
    const batch = Array.from({ length: Math.min(500, c.maxnumber - start + 1) }, (_, k) => start + k);
    const hashes = await Promise.all(batch.map((n) => crypto.subtle.digest("SHA-256", enc.encode(c.salt + n))));
    const found = hashes.findIndex((h) => hex(h) === c.challenge);
    if (found >= 0) return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: batch[found], salt: c.salt, signature: c.signature }));
  }
  return null;
};

// challenged sends once and, when the edge asks for a challenge, solves it and sends again.
export const challenged = async (send: (altcha?: string) => Promise<Response>): Promise<Response> => {
  const first = await send();
  if (first.status !== 403 || !(first.headers.get("content-type") ?? "").includes("json")) return first;
  const body = (await first.clone().json().catch(() => ({}))) as { error?: { code?: string; details?: { challenge?: Challenge } } };
  const c = body.error?.code === "CHALLENGE_REQUIRED" ? body.error.details?.challenge : undefined;
  const solution = c ? await solve(c) : null;
  return solution ? send(solution) : first;
};

export type Answer = { ok: boolean; status: number; body: Record<string, unknown> };

const altchaHeader = (altcha?: string): Record<string, string> => (altcha ? { "x-altcha": altcha } : {});

// post sends JSON and reads JSON back.
export const post = async (url: string, data: unknown): Promise<Answer> => {
  const res = await challenged((altcha) =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json", ...altchaHeader(altcha) }, body: JSON.stringify(data), credentials: "same-origin" }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
};

// postForm sends form fields the way a browser form would.
export const postForm = (url: string, fields: URLSearchParams, headers: Record<string, string> = {}) =>
  challenged((altcha) => fetch(url, { method: "POST", headers: { ...headers, ...altchaHeader(altcha) }, body: fields, credentials: "same-origin" }));

// The message to show for a failed answer: the app's own words when it gave some.
export const problem = (a: Answer) => {
  const e = a.body.error as { message?: string } | string | undefined;
  return typeof e === "string" ? e : e?.message ?? "Something went wrong. Try again.";
};
