// The staff pages' script. Every page works as plain forms; this adds saving as you type,
// pictures, copying links, confirmations and growing text boxes. In the live demo every write
// is a challenge route, so forms are sent through the solver there.
import { post, postForm, problem } from "./post.js";

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const demo = document.body.hasAttribute("data-demo");

const fieldsOf = (f: HTMLFormElement, submitter?: HTMLElement | null) =>
  new URLSearchParams([...new FormData(f, submitter instanceof HTMLButtonElement ? submitter : undefined).entries()].flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])));

// ----- Saving as you type -----

const flashSaved = (f: HTMLFormElement, ok: boolean, text?: string) =>
  $$(".saved", f).forEach((el) => {
    el.classList.toggle("err", !ok);
    el.lastChild!.textContent = ok ? " Saved" : ` ${text ?? "Not saved"}`;
    el.classList.add("on");
    if (ok) setTimeout(() => el.classList.remove("on"), 1800);
  });

$$<HTMLFormElement>("form[data-autosave]").forEach((f) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const save = async () => {
    timer = undefined;
    pending = false;
    const res = await postForm(f.action, fieldsOf(f), { "x-autosave": "1" }).catch(() => null);
    if (res?.ok) return flashSaved(f, true);
    const body = res ? ((await res.json().catch(() => ({}))) as { error?: { message?: string } }) : {};
    flashSaved(f, false, body.error?.message ?? "No connection");
  };
  const soon = () => {
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  };
  f.addEventListener("input", soon);
  f.addEventListener("change", soon);
  f.addEventListener("submit", () => (clearTimeout(timer), (pending = false)));
  // Leaving with a change not yet saved: send it on the way out.
  addEventListener("pagehide", () => {
    if (pending) navigator.sendBeacon?.(f.action, new Blob([fieldsOf(f).toString()], { type: "application/x-www-form-urlencoded" }));
  });
});

// ----- Confirmations and, in the demo, every form through the solver -----

document.addEventListener("submit", async (e) => {
  const f = e.target as HTMLFormElement;
  if (f.dataset.confirm && !confirm(f.dataset.confirm)) return e.preventDefault();
  if (!demo || f.method.toLowerCase() !== "post") return;
  e.preventDefault();
  const res = await postForm(f.action, fieldsOf(f, e.submitter)).catch(() => null);
  if (!res) return alert("No connection. Try again.");
  if (res.redirected) return location.assign(res.url);
  // A page with a message (a form the app turned back): show its body in place.
  const page = new DOMParser().parseFromString(await res.text(), "text/html");
  document.body.replaceWith(document.adoptNode(page.body));
});

// ----- Pictures: ask the app for an upload address, send the file straight to storage, save -----

$$<HTMLLabelElement>("[data-upload]").forEach((label) => {
  const input = label.querySelector<HTMLInputElement>("input[type=file]")!;
  const status = label.parentElement?.querySelector<HTMLElement>("[data-upload-status]");
  const say = (t: string) => status && (status.textContent = t);
  const url = label.dataset.upload!;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    say("Getting ready…");
    const ask = await post(url, { filename: file.name, content_type: file.type || "image/jpeg", size: file.size }).catch(() => null);
    if (!ask?.ok) return say(ask ? problem(ask) : "No connection. Try again.");
    const up = ask.body as { id: string; url: string; fields: Record<string, string> };
    const form = new FormData();
    Object.entries(up.fields ?? {}).forEach(([k, v]) => form.append(k, v));
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", up.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && say(`Uploading… ${Math.round((e.loaded / e.total) * 100)}%`);
    xhr.onerror = () => say("The upload failed. Try again.");
    xhr.onload = async () => {
      if (xhr.status >= 300) return say(`Storage refused the file (${xhr.status}).`);
      say("Saving…");
      const saved = await post(url, { upload_id: up.id }).catch(() => null);
      if (saved?.ok) location.reload();
      else say(saved ? problem(saved) : "Uploaded, but not saved. Try again.");
    };
    xhr.send(form);
  });
});

// ----- Small things -----

// Copy buttons are found on click, so they also work on a page the demo put in place.
document.addEventListener("click", async (e) => {
  const b = (e.target as Element | null)?.closest<HTMLButtonElement>("[data-copy]");
  const input = b ? (document.getElementById(b.dataset.copy!) as HTMLInputElement | null) : null;
  if (!b || !input) return;
  input.select();
  await navigator.clipboard?.writeText(input.value).catch(() => document.execCommand("copy"));
  b.classList.add("done");
  setTimeout(() => b.classList.remove("done"), 1500);
});

// A form marked data-busy shows that it is working once sent, so nobody presses twice.
document.addEventListener("submit", (e) => {
  const f = e.target as HTMLFormElement;
  if (!f.hasAttribute("data-busy")) return;
  const b = f.querySelector<HTMLButtonElement>("button[type=submit]");
  if (!b) return;
  b.setAttribute("aria-busy", "true");
  setTimeout(() => (b.disabled = true), 0);
});

// A client-picks-quantity item shows its fewest-to-most range.
$$<HTMLSelectElement>("select[name=qtymode]").forEach((s) =>
  s.addEventListener("change", () => {
    const range = s.closest(".item-ed")?.querySelector<HTMLElement>("[data-qty-range]");
    if (range) range.hidden = s.value !== "client";
  }),
);

const grow = (t: HTMLTextAreaElement) => {
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight + 2}px`;
};
$$<HTMLTextAreaElement>("textarea[data-grow], .item-ed textarea").forEach((t) => {
  grow(t);
  t.addEventListener("input", () => grow(t));
});
