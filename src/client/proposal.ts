// The proposal page's script: live totals as the client changes options, the sticky bar,
// questions, accepting with a typed or drawn signature, declining, and counting a real view.
// Totals come from pricing.ts, the same code the server stores them with.
import { confetti } from "./confetti.js";
import { post, problem } from "./post.js";
import { headline, lineMeta, money, normalise, quote, type Section, type Selections, type Terms } from "../pricing.js";

type Data = { token: string; state: string; sections: Section[]; terms: Terms; selections: Selections };

const data = JSON.parse(document.getElementById("data")!.textContent!) as Data;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const m = (c: number) => money(c, data.terms.currency);

let sel: Selections = normalise(data.sections, data.selections);

// ----- Live totals -----

const setText = (key: string, value: string) => $$(`[data-t="${key}"]`).forEach((el) => (el.textContent = value));

const draw = () => {
  const q = quote(data.sections, sel, data.terms);
  for (const s of data.sections.filter((x) => x.kind === "pricing" && !x.pick_one)) {
    for (const i of s.items) {
      const row = $(`[data-line="${i.id}"]`);
      if (!row) continue;
      const qty = sel.quantities[String(i.id)] ?? i.quantity;
      row.classList.toggle("off", i.mode === "optional" && !sel.optional[String(i.id)]);
      $(`[data-amount="${i.id}"]`, row)!.textContent = m(i.unit_price * qty);
      $(`[data-meta="${i.id}"]`, row)!.textContent = lineMeta(i, qty, data.terms.currency);
    }
  }
  for (const k of ["once", "month"] as const) {
    setText(`${k}.subtotal`, m(q[k].subtotal));
    setText(`${k}.discount`, `−${m(q[k].discount)}`);
    setText(`${k}.tax`, m(q[k].tax));
    setText(`${k}.total`, m(q[k].total));
  }
  const hasMonth = q.month.subtotal > 0;
  const hasOnce = q.once.subtotal > 0 || !hasMonth;
  $(`[data-block="once"]`)?.classList.toggle("hidden", !hasOnce);
  $(`[data-block="month"]`)?.classList.toggle("hidden", !hasMonth);
  setText("headline", m(hasOnce ? q.once.total : q.month.total));
  setText("deposit", m(q.deposit));
  const h = headline(q, data.terms);
  setText("dock", h.main);
  setText("docksub", h.sub);
  setText("dialog", [h.main, h.sub].filter(Boolean).join(" · "));
  const dock = $("#dock b");
  dock?.classList.remove("bump");
  void dock?.offsetWidth;
  dock?.classList.add("bump");
};

const change = (next: Partial<Selections>) => {
  sel = normalise(data.sections, { ...sel, ...next });
  draw();
};

if (data.state === "open" || data.state === "preview") {
  $$<HTMLInputElement>("[data-opt]").forEach((el) =>
    el.addEventListener("change", () => change({ optional: { ...sel.optional, [el.dataset.opt!]: el.checked } })),
  );
  $$<HTMLInputElement>("[data-pick]").forEach((el) =>
    el.addEventListener("change", () => el.checked && change({ picks: { ...sel.picks, [el.dataset.pick!]: Number(el.value) } })),
  );
  $$<HTMLInputElement>("[data-qty]").forEach((el) => {
    const set = (n: number) => {
      change({ quantities: { ...sel.quantities, [el.dataset.qty!]: n } });
      el.value = String(sel.quantities[el.dataset.qty!]);
    };
    el.addEventListener("change", () => set(Number(el.value)));
    el.closest(".stepper")!.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) =>
      b.addEventListener("click", () => set(Number(el.value) + Number(b.dataset.step))),
    );
  });
  draw();
}

// ----- The sticky bar: shown once the cover has scrolled away, hidden at the accept card -----

const dock = $("#dock");
if (dock) {
  let pastCover = false;
  let atEnd = false;
  const show = () => dock.classList.toggle("on", pastCover && !atEnd);
  new IntersectionObserver(([e]) => ((pastCover = !e.isIntersecting), show()), { threshold: 0.15 }).observe($(".cover")!);
  const end = $(".accept-card");
  if (end) new IntersectionObserver(([e]) => ((atEnd = e.isIntersecting), show())).observe(end);
}

// ----- A real view: the page was open and visible for two seconds (link previews don't count) -----

if (data.state === "open") {
  let sent = false;
  const count = () => {
    if (sent || document.visibilityState !== "visible") return;
    sent = true;
    void post(`/p/${data.token}/viewed`, {}).catch(() => undefined);
  };
  setTimeout(count, 2000);
  document.addEventListener("visibilitychange", () => setTimeout(count, 2000));
}

// ----- Questions -----

$$<HTMLFormElement>("[data-ask]").forEach((f) =>
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const btn = $<HTMLButtonElement>("button[type=submit]", f)!;
    btn.disabled = true;
    const a = await post(`/p/${data.token}/questions`, Object.fromEntries(fd)).catch(() => null);
    if (a?.ok) return location.replace(`/p/${data.token}#questions`), location.reload();
    $(".err", f)!.textContent = a ? problem(a) : "No connection. Try again.";
    btn.disabled = false;
  }),
);

// ----- Accepting -----

const acceptDialog = $<HTMLDialogElement>("#accept");
const declineDialog = $<HTMLDialogElement>("#decline");
$$("[data-open-accept]").forEach((b) => b.addEventListener("click", () => acceptDialog?.showModal()));
$$("[data-open-decline]").forEach((b) => b.addEventListener("click", () => declineDialog?.showModal()));
$$("[data-close]").forEach((b) => b.addEventListener("click", () => (b.closest("dialog") as HTMLDialogElement).close()));

type Point = [number, number];
let strokes: Point[][] = [];

if (acceptDialog) {
  const f = $<HTMLFormElement>("form", acceptDialog)!;
  const name = $<HTMLInputElement>("[name=name]", f)!;
  const typed = $("[data-typed]", f)!;
  const canvas = $<HTMLCanvasElement>("canvas", f)!;
  const clear = $<HTMLButtonElement>("[data-clear]", f)!;
  const kind = () => (new FormData(f).get("sigkind") === "drawn" ? "drawn" : "typed");
  const ctx = canvas.getContext("2d")!;

  const paint = () => {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
    ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 300, 0, 0);
    ctx.lineWidth = 4;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(document.body).color;
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.length === 1) ctx.lineTo(s[0][0] + 1, s[0][1]);
      ctx.stroke();
    }
  };
  const mode = () => {
    const drawn = kind() === "drawn";
    canvas.hidden = !drawn;
    clear.hidden = !drawn;
    typed.hidden = drawn;
    typed.textContent = name.value;
    if (drawn) paint();
  };
  name.addEventListener("input", mode);
  $$<HTMLInputElement>("[name=sigkind]", f).forEach((r) => r.addEventListener("change", mode));
  acceptDialog.addEventListener("toggle", mode);
  clear.addEventListener("click", () => ((strokes = []), paint()));

  const at = (e: PointerEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 300)];
  };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    strokes = [...strokes, [at(e)]];
    paint();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!canvas.hasPointerCapture(e.pointerId) || strokes.length === 0) return;
    strokes = [...strokes.slice(0, -1), [...strokes[strokes.length - 1], at(e)]];
    paint();
  });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const btn = $<HTMLButtonElement>("button[type=submit]", f)!;
    const err = $(".err", f)!;
    if (data.state === "preview") return void (err.textContent = "Preview only. Your client signs here.");
    const signature = kind() === "drawn" ? { kind: "drawn", strokes } : { kind: "typed", text: String(fd.get("name") ?? "") };
    btn.disabled = true;
    btn.lastChild!.textContent = " Signing…";
    const a = await post(`/p/${data.token}/accept`, { name: fd.get("name"), email: fd.get("email"), signature, selections: sel }).catch(() => null);
    if (a?.ok) return void location.assign(`/p/${data.token}?accepted=1#accepted`);
    err.textContent = a ? problem(a) : "No connection. Try again.";
    btn.disabled = false;
    btn.lastChild!.textContent = " Accept and sign";
  });
}

if (declineDialog) {
  const f = $<HTMLFormElement>("form", declineDialog)!;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (data.state === "preview") return void ($(".err", f)!.textContent = "Preview only.");
    const a = await post(`/p/${data.token}/decline`, { reason: new FormData(f).get("reason") }).catch(() => null);
    if (a?.ok) return void location.reload();
    $(".err", f)!.textContent = a ? problem(a) : "No connection. Try again.";
  });
}

confetti();
