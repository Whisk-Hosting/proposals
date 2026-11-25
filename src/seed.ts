// The sample proposals a new install starts with, so nothing is ever empty: one of each state,
// a template and a price list, for a made-up design studio. The demo's nightly reset runs the
// same seed. Change or delete them freely; the seed only runs on an empty database.
import { sql } from "./db.js";
import { fingerprint, freeze } from "./model.js";
import { liveDoc } from "./proposals.js";
import { defaultSelections, type Item, type Section } from "./pricing.js";
import * as store from "./store.js";

type ItemSeed = Partial<Omit<Item, "id">> & { name: string; price: number };
type SectionSeed =
  | { kind: "text"; heading: string; body: string }
  | { kind: "pricing"; heading: string; body?: string; pick_one?: boolean; items: ItemSeed[] };

type ProposalSeed = {
  title: string;
  subtitle: string;
  client: [name: string, company: string, email: string];
  discount?: number;
  deposit?: number;
  sections: SectionSeed[];
};

const item = (i: ItemSeed): Omit<Item, "id"> & { id: null } => ({
  id: null,
  name: i.name,
  description: i.description ?? "",
  unit_price: i.price * 100,
  quantity: i.quantity ?? 1,
  unit: i.unit ?? "",
  mode: i.mode ?? "fixed",
  selected: i.selected ?? true,
  recommended: i.recommended ?? false,
  qty_editable: i.qty_editable ?? false,
  qty_min: i.qty_min ?? 1,
  qty_max: i.qty_max ?? 10,
  recurring: i.recurring ?? "once",
});

const owner = { owner_email: "jordan@fernfield.example.com", owner_name: "Jordan Hayes" };

const make = async (p: ProposalSeed, opts: { template?: boolean; expires?: number } = {}): Promise<number> => {
  const id = await store.createProposal({
    title: p.title,
    subtitle: p.subtitle,
    client_name: p.client[0],
    client_company: p.client[1],
    client_email: p.client[2],
    currency: "USD",
    tax_mode: "exclusive",
    gst_rate_bp: 800,
    discount_bp: (p.discount ?? 0) * 100,
    deposit_bp: (p.deposit ?? 0) * 100,
    expires_on: opts.expires === undefined ? null : new Date(Date.now() + opts.expires * 86400000).toISOString().slice(0, 10),
    is_template: opts.template ?? false,
    ...owner,
  });
  for (const s of p.sections) {
    const sid = await store.addSection(id, { kind: s.kind, heading: s.heading, body: s.kind === "text" ? s.body : s.body ?? "", pick_one: s.kind === "pricing" && !!s.pick_one });
    if (s.kind === "pricing") await store.saveItems(sid, s.items.map(item));
  }
  await store.refreshValue(id);
  return id;
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000);

const at = (id: number, f: { created?: number; sent?: number; viewed?: [first: number, last: number, count: number]; decided?: number }) =>
  sql`update proposals set
    created_at = ${hoursAgo(f.created ?? 1)}, updated_at = ${hoursAgo(Math.min(f.created ?? 1, f.sent ?? Infinity, f.viewed?.[1] ?? Infinity, f.decided ?? Infinity))},
    status = case when ${f.sent ?? null}::int is null then status else 'sent' end,
    sent_at = ${f.sent === undefined ? null : hoursAgo(f.sent)},
    first_viewed_at = ${f.viewed ? hoursAgo(f.viewed[0]) : null}, last_viewed_at = ${f.viewed ? hoursAgo(f.viewed[1]) : null},
    view_count = ${f.viewed?.[2] ?? 0}
    where id = ${id}`;

const happened = (id: number, kind: string, actor: string, hours: number, detail = "") =>
  sql`insert into activity (proposal_id, kind, actor, detail, at) values (${id}, ${kind}, ${actor}, ${detail}, ${hoursAgo(hours)})`;

const intro = (who: string, what: string) => `Hi ${who},

Thanks for the time on Tuesday. Here's how we'd ${what}, what it costs, and how we'd work together. Tick the extras you want; the total updates as you go.

When you're happy, press **Accept** at the bottom and sign. We'll be in touch the same day to book a start.`;

const how = `1. **Discovery** (week 1). A workshop with your team and a look at what you have now.
2. **Design** (weeks 2–3). Two directions, then one refined with your feedback.
3. **Build and launch** (weeks 4–6). We build it, you check it, we go live together.

You'll have one person to talk to the whole way through, and a shared board where you can see where everything is.`;

const terms = `- Prices are in US dollars and exclude sales tax unless shown otherwise.
- A deposit is due on acceptance; the rest on completion. Invoices are due in 14 days.
- Two rounds of changes are included at each stage.
- You own everything we make for you once it's paid for.`;

const website: ProposalSeed = {
  title: "A new website for Maple Street Dental",
  subtitle: "Design, build and care for a site that books appointments while you sleep.",
  client: ["Sarah Mitchell", "Maple Street Dental", "sarah@maplestreetdental.example.com"],
  deposit: 30,
  sections: [
    { kind: "text", heading: "Hello", body: intro("Sarah", "rebuild maplestreetdental.example.com so new patients can find you and book online") },
    { kind: "text", heading: "What we heard", body: `- Most new patients find you on their phone, and the current site is hard to use on one.\n- The front desk spends hours a week on booking calls that could be online.\n- The site doesn't show the warmth of the practice, or the team.\n\nSo the new site is **phone first**, has **online booking** front and center, and puts **your people** on the home page.` },
    {
      kind: "pricing",
      heading: "Choose your package",
      pick_one: true,
      items: [
        { name: "Essentials", price: 6800, description: "Five pages, online booking, mobile-first design, and a launch checklist." },
        { name: "Growth", price: 11400, recommended: true, selected: true, description: "Everything in Essentials, plus treatment pages, patient reviews, a blog, and search optimization." },
        { name: "Practice", price: 16900, description: "Everything in Growth, plus a patient portal, forms that save to your practice software, and a photo shoot." },
      ],
    },
    {
      kind: "pricing",
      heading: "Add-ons",
      items: [
        { name: "Copywriting", price: 180, unit: "page", mode: "optional", selected: true, quantity: 6, qty_editable: true, qty_min: 1, qty_max: 30, description: "We write the words, in your voice, for each page." },
        { name: "Team photo day", price: 1450, mode: "optional", selected: false, description: "Half a day on site: portraits of the team and the rooms." },
        { name: "Spanish translation", price: 95, unit: "page", mode: "optional", selected: false, quantity: 6, qty_editable: true, qty_min: 1, qty_max: 30, description: "Each page in Spanish, checked by a fluent speaker." },
      ],
    },
    {
      kind: "pricing",
      heading: "Care plan",
      body: "Hosting, backups, security updates and an hour of changes a month.",
      items: [
        { name: "Hosting and care", price: 145, recurring: "month", description: "Fast hosting, daily backups, updates, uptime alerts." },
        { name: "Extra change hours", price: 120, unit: "hour", recurring: "month", mode: "optional", selected: false, quantity: 2, qty_editable: true, qty_min: 1, qty_max: 20, description: "For new pages, campaigns and fixes." },
      ],
    },
    { kind: "text", heading: "How we'll work", body: how },
    { kind: "text", heading: "Terms", body: terms },
  ],
};

const brand: ProposalSeed = {
  title: "Brand identity for Tidewater Coffee",
  subtitle: "A name people remember, on every cup, bag and sign.",
  client: ["Emily Brooks", "Tidewater Coffee", "emily@tidewatercoffee.example.com"],
  deposit: 50,
  sections: [
    { kind: "text", heading: "Hello", body: intro("Emily", "build the Tidewater brand from the ground up") },
    {
      kind: "pricing",
      heading: "The brand",
      items: [
        { name: "Brand strategy workshop", price: 1800, description: "Half a day: who you're for, what you stand for, how you sound." },
        { name: "Logo and identity", price: 5200, description: "Logo, colors, type, and a one-page guide." },
        { name: "Packaging design", price: 850, unit: "design", quantity: 3, mode: "optional", selected: true, qty_editable: true, qty_min: 1, qty_max: 8, description: "Bags, cups and labels." },
        { name: "Signage", price: 1200, mode: "optional", selected: false, description: "Shopfront and menu board." },
      ],
    },
    { kind: "text", heading: "Terms", body: terms },
  ],
};

const fitout: ProposalSeed = {
  title: "Office design, third floor",
  subtitle: "A floor that works for hybrid teams.",
  client: ["Michael Torres", "Summit Insurance", "michael@summitinsurance.example.com"],
  sections: [
    { kind: "text", heading: "Hello", body: intro("Michael", "redesign the third floor for your hybrid team") },
    {
      kind: "pricing",
      heading: "Design",
      items: [
        { name: "Space plan", price: 4200, description: "Desks, rooms and quiet spaces for 60 people." },
        { name: "Interior design", price: 7800, description: "Finishes, furniture and lighting." },
      ],
    },
  ],
};

const seo: ProposalSeed = {
  title: "Search and content retainer",
  subtitle: "More of the right people finding Lakeside Physical Therapy.",
  client: ["Olivia Reed", "Lakeside Physical Therapy", "olivia@lakesidept.example.com"],
  sections: [
    { kind: "text", heading: "Hello", body: intro("Olivia", "grow Lakeside's search traffic, month by month") },
    {
      kind: "pricing",
      heading: "Choose a plan",
      pick_one: true,
      items: [
        { name: "Starter", price: 650, recurring: "month", description: "Two articles a month and a monthly report." },
        { name: "Growth", price: 1250, recurring: "month", recommended: true, selected: true, description: "Four articles, local search pages, and a monthly call." },
      ],
    },
    { kind: "pricing", heading: "Setup", items: [{ name: "Search audit and setup", price: 900, description: "Technical fixes, tracking and a keyword plan." }] },
  ],
};

const photos: ProposalSeed = {
  title: "Product photography, spring range",
  subtitle: "Forty products, shot on white and in situ.",
  client: ["David Kim", "Kiln & Co", "david@kilnandco.example.com"],
  sections: [
    {
      kind: "pricing",
      heading: "Photography",
      items: [
        { name: "Studio day", price: 2400, quantity: 2, unit: "day" },
        { name: "Retouching", price: 18, quantity: 40, unit: "image" },
      ],
    },
  ],
};

const template: ProposalSeed = {
  title: "Website project",
  subtitle: "Design, build and care.",
  client: ["", "", ""],
  deposit: 30,
  sections: website.sections.filter((s) => s.heading !== "What we heard"),
};

const priceList = [
  { name: "Design hour", description: "Design work, billed by the hour.", unit_price: 14000, unit: "hour", recurring: "once" as const },
  { name: "Copywriting", description: "Words for one page, in your voice.", unit_price: 18000, unit: "page", recurring: "once" as const },
  { name: "Photo day", description: "A full day on location.", unit_price: 2400_00, unit: "day", recurring: "once" as const },
  { name: "Hosting and care", description: "Hosting, backups and updates.", unit_price: 14500, unit: "", recurring: "month" as const },
  { name: "Brand workshop", description: "Half a day with your team.", unit_price: 1800_00, unit: "", recurring: "once" as const },
  { name: "Search audit", description: "Technical fixes, tracking and a keyword plan.", unit_price: 900_00, unit: "", recurring: "once" as const },
];

// seed fills an empty database and answers whether it did.
export const seed = async (): Promise<boolean> => {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from proposals`;
  if (n > 0) return false;
  await store.saveSettings({ business_name: "Fern & Field", accent: "#1d6b57", notify_email: owner.owner_email, currency: "USD", tax_mode: "exclusive", gst_rate_bp: 800 });

  const web = await make(website, { expires: 21 });
  await at(web, { created: 52, sent: 48, viewed: [30, 2, 4] });
  await happened(web, "created", owner.owner_name, 52);
  await happened(web, "sent", owner.owner_name, 48, "Emailed to sarah@maplestreetdental.example.com");
  await happened(web, "viewed", "Sarah Mitchell", 30, "Opened for the first time");
  const q1 = await store.ask(web, { asked_by: "Sarah Mitchell", asked_email: "sarah@maplestreetdental.example.com", body: "Can we move our current booking system across, or do we start fresh?" });
  await store.answer(web, q1, "We can bring your existing patients and booking types across. It's included in Growth and Practice.", owner.owner_name);
  await sql`update questions set asked_at = ${hoursAgo(29)}, answered_at = ${hoursAgo(26)} where id = ${q1}`;
  await happened(web, "question", "Sarah Mitchell", 29, "Can we move our current booking system across, or do we start fresh?");
  await happened(web, "answer", owner.owner_name, 26);
  const q2 = await store.ask(web, { asked_by: "Sarah Mitchell", asked_email: "sarah@maplestreetdental.example.com", body: "Does the care plan include changes to opening hours and holiday notices?" });
  await sql`update questions set asked_at = ${hoursAgo(2)} where id = ${q2}`;
  await happened(web, "question", "Sarah Mitchell", 2, "Does the care plan include changes to opening hours and holiday notices?");

  const coffee = await make(brand);
  await at(coffee, { created: 200, sent: 190, viewed: [180, 170, 3], decided: 170 });
  const secs = await store.sectionsFor(coffee);
  const p = (await store.proposalById(coffee))!;
  const doc = await liveDoc(p);
  const frozen = freeze(doc, defaultSelections(secs), {
    name: "Emily Brooks",
    email: "emily@tidewatercoffee.example.com",
    signature: { kind: "typed", text: "Emily Brooks" },
    ip: "203.0.113.24",
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)",
    accepted_at: hoursAgo(170).toISOString(),
  });
  await store.accept(coffee, frozen, fingerprint(frozen));
  await sql`update proposals set decided_at = ${hoursAgo(170)}, updated_at = ${hoursAgo(170)} where id = ${coffee}`;
  await sql`update acceptances set created_at = ${hoursAgo(170)} where proposal_id = ${coffee}`;
  await happened(coffee, "created", owner.owner_name, 200);
  await happened(coffee, "sent", owner.owner_name, 190);
  await happened(coffee, "viewed", "Emily Brooks", 180, "Opened for the first time");
  await happened(coffee, "accepted", "Emily Brooks", 170);

  const office = await make(fitout);
  await at(office, { created: 3 });
  await happened(office, "created", owner.owner_name, 3);

  const retainer = await make(seo, { expires: 12 });
  await at(retainer, { created: 30, sent: 28 });
  await happened(retainer, "created", owner.owner_name, 30);
  await happened(retainer, "sent", owner.owner_name, 28, "Emailed to olivia@lakesidept.example.com");

  const shoot = await make(photos);
  await at(shoot, { created: 400, sent: 390, viewed: [380, 300, 2], decided: 300 });
  await store.decline(shoot, "We've decided to shoot in-house this season.");
  await sql`update proposals set decided_at = ${hoursAgo(300)}, updated_at = ${hoursAgo(300)} where id = ${shoot}`;
  await happened(shoot, "sent", owner.owner_name, 390);
  await happened(shoot, "declined", "David Kim", 300, "We've decided to shoot in-house this season.");

  await make(template, { template: true });
  for (const i of priceList) await store.savePriceItem(null, i);
  return true;
};
