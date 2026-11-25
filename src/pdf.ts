// The accepted proposal as a PDF, typeset with Typst from the frozen copy: what the client
// chose, the totals, the signature and the evidence. Everything goes in as JSON data, never
// into the markup, so no text a person typed can change the layout.
import { readFile } from "node:fs/promises";
import { Lexer, type Token, type Tokens } from "marked";
import { prettyTime, type Frozen } from "./model.js";
import { isIncluded, lineMeta, money, qtyFor } from "./pricing.js";
import { accentOf } from "./views/layout.js";

type Run = { t: string; b?: boolean; i?: boolean };
type Block = { k: "h" | "p" | "q"; runs: Run[] } | { k: "ul" | "ol"; items: Run[][] };

const plain = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// runs turns Markdown's inline tokens into text with bold and italic marked.
const runs = (tokens: Token[] = [], style: Omit<Run, "t"> = {}): Run[] =>
  tokens.flatMap((t): Run[] => {
    if (t.type === "strong") return runs((t as Tokens.Strong).tokens, { ...style, b: true });
    if (t.type === "em") return runs((t as Tokens.Em).tokens, { ...style, i: true });
    if ("tokens" in t && Array.isArray(t.tokens) && t.type !== "text") return runs(t.tokens as Token[], style);
    if (t.type === "br") return [{ t: "\n" }];
    const text = "text" in t ? String(t.text) : "";
    return text ? [{ t: plain(text), ...style }] : [];
  });

// blocks reads a section's Markdown into headings, paragraphs, quotes and lists.
export const blocks = (md: string): Block[] =>
  new Lexer().lex(md).flatMap((t): Block[] => {
    if (t.type === "heading") return [{ k: "h", runs: runs((t as Tokens.Heading).tokens) }];
    if (t.type === "paragraph") return [{ k: "p", runs: runs((t as Tokens.Paragraph).tokens) }];
    if (t.type === "blockquote") return [{ k: "q", runs: runs((t as Tokens.Blockquote).tokens.flatMap((x) => ("tokens" in x ? (x.tokens as Token[]) : []))) }];
    if (t.type === "list") {
      const l = t as Tokens.List;
      return [{ k: l.ordered ? "ol" : "ul", items: l.items.map((it) => runs(it.tokens.flatMap((x) => (x.type === "text" && "tokens" in x ? (x.tokens as Token[]) : [x])))) }];
    }
    return [];
  });

const template = String.raw`
#let d = json(bytes(sys.inputs.data))
#let accent = rgb(d.accent)
#let muted = rgb("#6b665d")
#let line-c = rgb("#e3dfd6")
#set document(title: d.title, author: d.business)
#set page(paper: "a4", margin: (x: 22mm, top: 20mm, bottom: 22mm),
  footer: context [#set text(size: 8pt, fill: muted); #d.business #h(1fr) #counter(page).display("1 of 1", both: true)])
#set text(font: "Figtree", size: 10.5pt, fill: rgb("#1f1d1a"))
#set par(leading: 0.7em, spacing: 1.1em)
#let runs(rs) = for r in rs {
  let c = r.t
  if r.at("b", default: false) { c = strong(c) }
  if r.at("i", default: false) { c = emph(c) }
  c
}

#block(width: 100%, fill: accent, inset: (x: 14mm, y: 14mm), radius: 4pt, outset: (x: 8mm))[
  #set text(fill: white)
  #text(size: 9pt, weight: "bold", tracking: 0.14em)[#upper(d.business + " · Proposal")]
  #v(10mm)
  #text(size: 26pt, weight: "extrabold", tracking: -0.02em)[#d.title]
  #if d.subtitle != "" { v(2mm); text(size: 12pt)[#d.subtitle] }
  #v(8mm)
  #text(size: 9.5pt)[#d.prepared]
]
#v(6mm)

#for s in d.sections {
  v(5mm)
  if s.heading != "" { text(size: 15pt, weight: "bold")[#s.heading]; v(1mm) }
  if s.kind == "text" {
    for b in s.blocks {
      if b.k == "h" { v(2mm); text(size: 11.5pt, weight: "bold")[#runs(b.runs)] }
      else if b.k == "p" { par[#runs(b.runs)] }
      else if b.k == "q" { block(inset: (left: 10pt, y: 4pt), stroke: (left: 2pt + accent))[#runs(b.runs)] }
      else if b.k == "ul" { list(..b.items.map(i => runs(i))) }
      else if b.k == "ol" { enum(..b.items.map(i => runs(i))) }
    }
  } else if s.kind == "pricing" {
    table(columns: (1fr, auto), stroke: (x, y) => (bottom: 0.6pt + line-c), inset: (x: 0pt, y: 7pt), align: (left, right),
      ..s.lines.map(l => (
        [#text(weight: "semibold")[#l.name] #if l.desc != "" [\ #text(size: 9pt, fill: muted)[#l.desc]]],
        [#text(weight: "semibold")[#l.amount] #if l.meta != "" [\ #text(size: 8.5pt, fill: muted)[#l.meta]]],
      )).flatten())
  }
}

#v(8mm)
#block(width: 100%, fill: rgb("#f7f5f0"), inset: 12pt, radius: 6pt, breakable: false)[
  #text(size: 13pt, weight: "bold")[Investment]
  #v(2mm)
  #table(columns: (1fr, auto), stroke: none, inset: (x: 0pt, y: 4pt), align: (left, right),
    ..d.totals.map(t => (
      if t.strong { text(weight: "bold")[#t.label] } else { text(fill: muted)[#t.label] },
      if t.strong { text(weight: "bold", size: 12pt)[#t.value] } else [#t.value],
    )).flatten())
]

#v(8mm)
#block(width: 100%, stroke: 0.8pt + line-c, inset: 14pt, radius: 6pt, breakable: false)[
  #text(size: 13pt, weight: "bold")[Accepted]
  #v(2mm)
  #if d.sig.kind == "typed" { text(font: "Caveat", size: 30pt)[#d.sig.text] } else { image(bytes(d.sig.svg), width: 6cm) }
  #line(length: 7cm, stroke: 0.6pt + muted)
  #v(1mm)
  #grid(columns: (auto, 1fr), column-gutter: 10pt, row-gutter: 5pt,
    ..d.evidence.map(e => (text(fill: muted, size: 9pt)[#e.at(0)], text(size: 9pt)[#e.at(1)])).flatten())
]
`;

const fontFiles = [
  "Figtree-400.ttf",
  "Figtree-400i.ttf",
  "Figtree-600.ttf",
  "Figtree-700.ttf",
  "Figtree-800.ttf",
  "Caveat-600.ttf",
];

type Compiler = { pdf: (o: { mainFileContent: string; inputs: Record<string, string> }) => Buffer; evictCache: (n: number) => void };
let compiler: Compiler | undefined;

// The Typst compiler is a native module, loaded the first time a PDF is asked for so the app
// starts fast. The fonts sit beside the bundle in dist/fonts (build.mjs copies them).
const getCompiler = async (): Promise<Compiler> => {
  if (compiler) return compiler;
  const { NodeCompiler } = await import("@myriaddreamin/typst-ts-node-compiler");
  const fontBlobs = await Promise.all(fontFiles.map((f) => readFile(new URL(`./fonts/${f}`, import.meta.url))));
  compiler = NodeCompiler.create({ fontArgs: [{ fontBlobs }] }) as unknown as Compiler;
  return compiler;
};

// pdfData is everything the template prints, worked out here. Pure.
export const pdfData = (f: Frozen, fp: string, link: string) => {
  const { doc, selections: sel, quote: q, acceptance: a } = f;
  const t = doc.proposal;
  const m = (c: number) => money(c, t.currency);
  const hasMonth = q.month.subtotal > 0;
  const hasOnce = q.once.subtotal > 0 || !hasMonth;
  const totals = (["once", "month"] as const)
    .filter((k) => (k === "once" ? hasOnce : hasMonth))
    .flatMap((k) => [
      { label: k === "once" ? "Subtotal" : "Monthly subtotal", value: m(q[k].subtotal), strong: false },
      ...(t.discount_bp > 0 ? [{ label: `Discount ${t.discount_bp / 100}%`, value: `−${m(q[k].discount)}`, strong: false }] : []),
      ...(t.tax_mode === "exclusive" ? [{ label: `Tax ${t.gst_rate_bp / 100}%`, value: m(q[k].tax), strong: false }] : t.tax_mode === "inclusive" ? [{ label: "Includes tax", value: m(q[k].tax), strong: false }] : []),
      { label: k === "once" ? "Total" : "Each month", value: m(q[k].total), strong: true },
    ]);
  const deposit = t.deposit_bp > 0 ? [{ label: `Deposit ${t.deposit_bp / 100}%`, value: m(q.deposit), strong: true }] : [];
  return {
    accent: accentOf(doc.brand),
    business: doc.brand.business_name,
    title: t.title,
    subtitle: t.subtitle,
    prepared: [t.client_company || t.client_name ? `For ${[t.client_name, t.client_company].filter(Boolean).join(", ")}` : "", t.owner_name ? `From ${t.owner_name}` : ""].filter(Boolean).join("   ·   "),
    sections: doc.sections
      .filter((s) => s.kind !== "image")
      .map((s) =>
        s.kind === "text"
          ? { kind: "text", heading: s.heading, blocks: blocks(s.body) }
          : {
              kind: "pricing",
              heading: s.heading,
              lines: s.items.filter((i) => isIncluded(s, i, sel)).map((i) => {
                const qty = qtyFor(i, sel);
                return { name: i.name, desc: i.description, amount: m(i.unit_price * qty) + (i.recurring === "month" ? " / month" : ""), meta: lineMeta(i, qty, t.currency) };
              }),
            },
      ),
    totals: [...totals, ...deposit],
    sig: a.signature.kind === "typed" ? { kind: "typed", text: a.signature.text } : { kind: "drawn", svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300"><path d="${a.signature.path}" fill="none" stroke="#1f1d1a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
    evidence: [
      ["Name", a.name],
      ["Email", a.email],
      ["When", `${prettyTime(a.accepted_at)} Eastern time (${a.accepted_at})`],
      ["IP address", a.ip || "unknown"],
      ["Device", a.user_agent || "unknown"],
      ["Link", link],
      ["Fingerprint", `SHA-256 ${fp}`],
    ],
  };
};

export const pdfFor = async (f: Frozen, fp: string, link: string): Promise<Buffer> => {
  const c = await getCompiler();
  try {
    return c.pdf({ mainFileContent: template, inputs: { data: JSON.stringify(pdfData(f, fp, link)) } });
  } finally {
    c.evictCache(10);
  }
};
