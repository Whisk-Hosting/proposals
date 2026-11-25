// The whole stylesheet. Served once at /assets/app.css and cached by browsers and the edge.
export const css = String.raw`
[hidden] { display: none !important; }
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-wght-normal.woff2) format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-ext-wght-normal.woff2) format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Figtree"; font-style: italic; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-wght-italic.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 600; font-display: swap; src: url(/assets/fonts/jetbrains-mono-latin-600-normal.woff2) format("woff2"); }
:root {
  --bg: #f7f5f0; --surface: #ffffff; --surface-2: #f0ede6; --ink: #1f1d1a; --muted: #6b665d;
  --line: #e3dfd6; --line-strong: #cfc9bd; --good: #2f8a57; --bad: #c23b3b;
  --accent: #1d6b57; --on-accent: #ffffff;
  --accent-soft: color-mix(in oklab, var(--accent) 14%, transparent);
  --accent-ink: color-mix(in oklab, var(--accent) 78%, var(--ink));
  --shadow: 0 1px 2px rgb(30 25 15 / .06), 0 8px 24px -8px rgb(30 25 15 / .16);
  --radius: 16px; --font: "Figtree", system-ui, sans-serif; --script: "Caveat", "Segoe Script", cursive; --mono: "JetBrains Mono", ui-monospace, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121110; --surface: #1b1a18; --surface-2: #25231f; --ink: #f1ede6; --muted: #a39d92;
    --line: #322f2a; --line-strong: #4a463f; --good: #5cc48a; --bad: #ef6b6b;
    --accent-ink: color-mix(in oklab, var(--accent) 70%, white);
    --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 10px 30px -10px rgb(0 0 0 / .7);
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 17px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img { max-width: 100%; }
h1, h2, h3 { line-height: 1.2; letter-spacing: -0.015em; margin: 0 0 .4em; }
h1 { font-size: clamp(2rem, 4.5vw, 3rem); font-weight: 750; }
h2 { font-size: 1.5rem; font-weight: 700; }
h3 { font-size: 1.15rem; font-weight: 650; }
p { margin: 0 0 1em; }
.icon { flex: none; vertical-align: -0.2em; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.muted { color: var(--muted); }
.small { font-size: .875rem; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 6px; }

/* Header */
.site-header { border-bottom: 1px solid var(--line); background: color-mix(in oklab, var(--bg) 88%, transparent); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 10; }
.site-header .wrap { display: flex; align-items: center; gap: 24px; height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 750; font-size: 1.1rem; text-decoration: none; letter-spacing: -0.01em; }
.brand-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.nav { display: flex; gap: 4px; margin-left: auto; align-items: center; }
.nav a { text-decoration: none; padding: 8px 12px; border-radius: 10px; color: var(--muted); font-weight: 550; font-size: .95rem; display: inline-flex; gap: 6px; align-items: center; }
.nav a:hover, .nav a[aria-current] { color: var(--ink); background: var(--surface-2); }
@media (max-width: 640px) { .nav a span.label { display: none; } .site-header .wrap { gap: 12px; } }

/* Buttons and badges */
.btn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: 600 .95rem/1 var(--font); padding: 12px 18px; border-radius: 12px; text-decoration: none; cursor: pointer; transition: transform .12s, box-shadow .12s, background .12s; }
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.btn:active { transform: none; }
.btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.btn.ghost { background: transparent; border-color: transparent; }
.btn.ghost:hover { background: var(--surface-2); box-shadow: none; }
.btn.small { padding: 8px 12px; font-size: .85rem; border-radius: 10px; }
.btn.danger { color: var(--bad); }
.btn[disabled] { opacity: .5; pointer-events: none; }
.badge { display: inline-flex; align-items: center; gap: 4px; font: 650 .72rem/1 var(--font); text-transform: uppercase; letter-spacing: .06em; padding: 5px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); white-space: nowrap; }
.badge.accent { background: var(--accent); color: var(--on-accent); }
.badge.good { background: color-mix(in oklab, var(--good) 16%, transparent); color: var(--good); }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.spread { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }

/* Notices, empty states, tables, forms */
.notice { padding: 14px 18px; border-radius: 12px; background: var(--surface-2); margin: 0 0 20px; }
.notice.error { background: color-mix(in oklab, var(--bad) 12%, transparent); color: var(--ink); }
.notice.good { background: color-mix(in oklab, var(--good) 12%, transparent); }
.empty { text-align: center; padding: 64px 24px; border: 2px dashed var(--line); border-radius: 20px; color: var(--muted); }
.empty h2 { color: var(--ink); }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; }
.table { width: 100%; border-collapse: collapse; font-size: .95rem; }
.table th { text-align: left; font-weight: 600; color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.table td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.table tr:last-child td { border-bottom: 0; }
.table-wrap { overflow-x: auto; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
.field label, .label { font-weight: 600; font-size: .9rem; }
.field .hint { color: var(--muted); font-size: .82rem; }
input[type=text], input[type=email], input[type=number], input[type=date], input[type=search], input[type=url], textarea, select { font: inherit; font-size: .95rem; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 10px 12px; width: 100%; }
input[type=color] { width: 52px; height: 40px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); padding: 3px; }
textarea { min-height: 120px; resize: vertical; line-height: 1.55; }
textarea.code { font-family: var(--mono); font-size: .88rem; min-height: 360px; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.check { display: flex; gap: 10px; align-items: center; font-weight: 550; }
.check input { accent-color: var(--accent); width: 18px; height: 18px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 18px; }
@media (max-width: 640px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

.icon-btn { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid transparent; background: transparent; color: var(--muted); cursor: pointer; padding: 0; }
.icon-btn:hover { background: var(--surface-2); color: var(--ink); border-color: var(--line); }
.icon-btn .icon { width: 17px; height: 17px; }
.menu { position: relative; display: inline-block; }
.menu summary { list-style: none; }
.menu summary::-webkit-details-marker { display: none; }
.menu-body { position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 6px; display: grid; gap: 2px; min-width: 220px; text-align: left; }
.menu-body form { margin: 0; }
.menu-body .btn { width: 100%; justify-content: flex-start; }
.segmented { display: inline-flex; width: fit-content; border: 1px solid var(--line-strong); border-radius: 12px; padding: 3px; gap: 3px; flex-wrap: wrap; }
.segmented label { margin: 0; }
.segmented input { position: absolute; opacity: 0; pointer-events: none; }
.segmented span { display: block; padding: 8px 14px; border-radius: 9px; font-weight: 600; font-size: .9rem; cursor: pointer; color: var(--muted); }
.segmented input:checked + span { background: var(--accent); color: var(--on-accent); }
.segmented input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px; }
@font-face { font-family: "Caveat"; font-style: normal; font-weight: 600; font-display: swap; src: url(/assets/fonts/caveat-latin-600-normal.woff2) format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Caveat"; font-style: normal; font-weight: 600; font-display: swap; src: url(/assets/fonts/caveat-latin-ext-600-normal.woff2) format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
.num { font-variant-numeric: tabular-nums; }
.right { text-align: right; }
.center { text-align: center; }
.inline { display: inline; margin: 0; }
.hidden { display: none !important; }
.badge.warn { background: color-mix(in oklab, #d99a1c 18%, transparent); color: #a8730c; }
.badge.bad { background: color-mix(in oklab, var(--bad) 14%, transparent); color: var(--bad); }
.badge.info { background: color-mix(in oklab, #3d6fe0 14%, transparent); color: #3d63c9; }
@media (prefers-color-scheme: dark) { .badge.warn { color: #e6b450; } .badge.info { color: #8eaaf0; } }
.badge.dot::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.btn.block { width: 100%; justify-content: center; }
.btn.big { padding: 16px 26px; font-size: 1.05rem; border-radius: 14px; }
.btn .icon { width: 18px; height: 18px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.link:hover { color: var(--ink); }

/* ---------- Staff ---------- */
.site-header { border-bottom: 1px solid var(--line); background: color-mix(in oklab, var(--bg) 88%, transparent); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 20; }
.site-header .wrap { display: flex; align-items: center; gap: 24px; height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 750; font-size: 1.1rem; text-decoration: none; letter-spacing: -0.01em; min-width: 0; }
.brand img { height: 28px; width: auto; border-radius: 6px; }
.brand-mark { width: 26px; height: 26px; border-radius: 8px; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; font-size: .8rem; font-weight: 800; flex: none; }
.nav { display: flex; gap: 2px; margin-left: auto; align-items: center; }
.nav a, .nav button { text-decoration: none; padding: 8px 12px; border-radius: 10px; color: var(--muted); font: 550 .95rem var(--font); display: inline-flex; gap: 6px; align-items: center; border: 0; background: none; cursor: pointer; }
.nav a:hover, .nav a[aria-current], .nav button:hover { color: var(--ink); background: var(--surface-2); }
.nav .count-pill { background: var(--accent); color: var(--on-accent); border-radius: 99px; padding: 1px 7px; font-size: .72rem; font-weight: 700; }
@media (max-width: 760px) { .nav .label { display: none; } .site-header .wrap { gap: 10px; } .nav a, .nav button { padding: 8px 9px; } }
.demo-bar { background: var(--ink); color: var(--bg); font-size: .85rem; }
.demo-bar .wrap { display: flex; gap: 12px; align-items: center; justify-content: center; height: 36px; }
.demo-bar button { color: inherit; opacity: .8; }
footer.site { border-top: 1px solid var(--line); padding: 28px 0 40px; color: var(--muted); font-size: .85rem; margin-top: 40px; }
main.staff { padding-bottom: 40px; }

.page-head { padding: 44px 0 24px; display: flex; gap: 16px; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; }
.page-head h1 { margin: 0; }
.page-head .crumbs { margin-bottom: 6px; }
.crumbs { color: var(--muted); font-size: .9rem; font-weight: 550; display: flex; gap: 8px; flex-wrap: wrap; }
.crumbs a { text-decoration: none; }
.crumbs a:hover { color: var(--ink); }

.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 28px; }
@media (max-width: 860px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px 22px; display: flex; flex-direction: column; gap: 4px; position: relative; overflow: hidden; }
.stat .k { color: var(--muted); font-size: .85rem; font-weight: 600; }
.stat .v { font-size: clamp(1.4rem, 3vw, 1.9rem); font-weight: 750; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.stat .s { color: var(--muted); font-size: .82rem; }
.stat.hl { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.stat.hl .k, .stat.hl .s { color: color-mix(in oklab, var(--on-accent) 80%, transparent); }
.stat .spark { position: absolute; right: -10px; bottom: -14px; width: 90px; height: 90px; border-radius: 50%; background: color-mix(in oklab, var(--on-accent) 12%, transparent); }

.home-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; align-items: start; }
@media (max-width: 960px) { .home-grid { grid-template-columns: 1fr; } }
.tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 14px; }
.tabs a { font: 600 .9rem var(--font); padding: 8px 14px; border-radius: 10px; color: var(--muted); text-decoration: none; display: inline-flex; gap: 6px; align-items: center; }
.tabs a:hover { color: var(--ink); }
.tabs a[aria-current] { background: var(--surface); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
.tabs a .n { color: var(--muted); font-weight: 500; font-variant-numeric: tabular-nums; }

.plist { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.prow { display: grid; grid-template-columns: 6px minmax(0, 1fr) auto 120px; gap: 0 18px; align-items: center; padding: 16px 20px 16px 0; text-decoration: none; border-bottom: 1px solid var(--line); transition: background .15s; }
.prow:last-child { border-bottom: 0; }
.prow:hover { background: color-mix(in oklab, var(--surface-2) 60%, var(--surface)); }
.prow .rail { align-self: stretch; margin: -16px 0; background: var(--line); }
.prow.st-viewed .rail { background: #3d6fe0; } .prow.st-sent .rail { background: var(--line-strong); }
.prow.st-accepted .rail { background: var(--good); } .prow.st-declined .rail, .prow.st-expired .rail { background: var(--bad); }
.prow .t { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prow .c { color: var(--muted); font-size: .88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prow .when { color: var(--muted); font-size: .82rem; text-align: right; white-space: nowrap; }
.prow .val { font-weight: 650; text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { .prow { grid-template-columns: 6px minmax(0, 1fr) auto; } .prow .when { display: none; } }
.side-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; margin-bottom: 18px; }
.side-card h2 { font-size: 1rem; margin: 0 0 12px; display: flex; gap: 8px; align-items: center; }
.side-card h2 .icon { color: var(--muted); }
.feed { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.feed li { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 10px; align-items: start; font-size: .9rem; }
.feed .ic { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); color: var(--muted); }
.feed .ic .icon { width: 15px; height: 15px; }
.feed .ic.good { background: color-mix(in oklab, var(--good) 15%, transparent); color: var(--good); }
.feed .ic.bad { background: color-mix(in oklab, var(--bad) 13%, transparent); color: var(--bad); }
.feed .ic.info { background: color-mix(in oklab, #3d6fe0 14%, transparent); color: #3d6fe0; }
.feed .ic.accent { background: var(--accent-soft); color: var(--accent-ink); }
.feed a { text-decoration: none; font-weight: 600; }
.feed .m { color: var(--muted); font-size: .8rem; }
.feed .q { color: var(--muted); font-style: italic; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.attention { display: grid; gap: 8px; }
.attention a { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--surface-2); text-decoration: none; font-weight: 600; font-size: .9rem; }
.attention a:hover { background: var(--accent-soft); }
.attention a span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Editor */
.editor { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; align-items: start; padding-bottom: 40px; }
@media (max-width: 960px) { .editor { grid-template-columns: 1fr; } .editor aside { order: -1; } }
.editor aside { position: sticky; top: 84px; display: grid; gap: 18px; }
@media (max-width: 960px) { .editor aside { position: static; } }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.card > header { padding: 16px 20px; border-bottom: 1px solid var(--line); display: flex; gap: 10px; align-items: center; }
.card > header h2, .card > header h3 { margin: 0; font-size: 1rem; flex: 1; display: flex; gap: 10px; align-items: center; }
.card > header .kind { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--accent-soft); color: var(--accent-ink); }
.card > header .kind .icon { width: 16px; height: 16px; }
.card .body { padding: 20px; }
.card .body > .field:last-child { margin-bottom: 0; }
.cover-card { overflow: hidden; }
.cover-preview { height: 120px; position: relative; }
.sections { display: grid; gap: 18px; margin-top: 18px; }
.add-bar { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; padding: 18px; border: 2px dashed var(--line); border-radius: var(--radius); margin-top: 18px; }
.add-bar form { margin: 0; }
.saved { color: var(--good); font-size: .82rem; font-weight: 600; opacity: 0; transition: opacity .3s; display: inline-flex; gap: 4px; align-items: center; }
.saved.on { opacity: 1; }
.saved.err { color: var(--bad); }

.items { display: grid; gap: 10px; }
.item-ed { border: 1px solid var(--line); border-radius: 14px; padding: 14px; background: var(--bg); display: grid; gap: 10px; }
.item-ed .r1 { display: grid; grid-template-columns: minmax(0, 1fr) 130px 90px 110px 34px; gap: 8px; align-items: end; }
.item-ed .r3 { display: flex; gap: 6px 16px; flex-wrap: wrap; align-items: center; font-size: .88rem; }
.item-ed .r3 select { width: auto; padding: 6px 10px; font-size: .88rem; }
.item-ed .r3 input[type=number] { width: 70px; padding: 6px 8px; font-size: .88rem; }
.item-ed .r3 .check { font-weight: 500; }
.item-ed label.mini { font-size: .75rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 4px; }
.item-ed textarea { min-height: 0; height: 44px; }
@media (max-width: 700px) { .item-ed .r1 { grid-template-columns: 1fr 1fr; } .item-ed .r1 > :first-child { grid-column: 1 / -1; } }
.items-foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-top: 12px; }
.items-foot select { width: auto; }
.share { display: grid; gap: 10px; }
.copyfield { display: flex; gap: 6px; }
.copyfield input { font: .8rem var(--mono); }
.codeblock { font: .78rem/1.55 var(--mono); background: var(--surface-2); border-radius: 10px; padding: 12px 14px; overflow-x: auto; white-space: pre; margin: 10px 0; }
tr.faded td { opacity: .55; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: .9rem; margin: 0; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.qa-ed { border-top: 1px solid var(--line); padding: 14px 0; }
.qa-ed:first-child { border-top: 0; padding-top: 0; }
.qa-ed .who { font-size: .8rem; color: var(--muted); }
.qa-ed p { margin: 4px 0 8px; }
.qa-ed textarea { min-height: 70px; }
.lockbar { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-radius: 14px; background: var(--surface-2); margin-bottom: 18px; flex-wrap: wrap; }

/* Small proposal cards on template and empty pages */
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; text-decoration: none; display: flex; flex-direction: column; transition: transform .15s, box-shadow .15s; }
.tile:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
.tile .art { height: 110px; }
.tile .in { padding: 16px 18px 18px; display: grid; gap: 4px; }
.tile .in b { font-size: 1.05rem; }
.tile .in span { color: var(--muted); font-size: .88rem; }
.tile.new { border-style: dashed; border-width: 2px; align-items: center; justify-content: center; min-height: 200px; color: var(--muted); font-weight: 650; gap: 8px; background: transparent; }

/* The generated cover art: soft light from the brand colour. */
.art { background-color: var(--accent);
  background-image: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--accent) 55%, white) 0%, transparent 55%),
    radial-gradient(90% 120% at 0% 100%, color-mix(in oklab, var(--accent) 60%, black) 0%, transparent 60%),
    radial-gradient(60% 60% at 70% 80%, color-mix(in oklab, var(--accent) 70%, #f3c26b) 0%, transparent 70%); }
.art.img { background-size: cover; background-position: center; }

/* ---------- The proposal, as the client sees it ---------- */
body.doc { background: var(--surface); }
@media (prefers-color-scheme: dark) { body.doc { background: var(--bg); } }
.doc-top { position: absolute; inset: 0 0 auto; z-index: 5; color: #fff; }
.doc-top .wrap { display: flex; align-items: center; justify-content: space-between; height: 72px; max-width: 1200px; }
.doc-top .brand { color: #fff; }
.doc-top .brand-mark { background: rgb(255 255 255 / .18); color: #fff; backdrop-filter: blur(6px); }
.doc-top .btn { background: rgb(255 255 255 / .14); border-color: rgb(255 255 255 / .3); color: #fff; backdrop-filter: blur(8px); }
.cover { position: relative; min-height: min(88vh, 860px); display: flex; align-items: flex-end; color: #fff; overflow: hidden; }
.cover::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgb(0 0 0 / .22) 0%, transparent 30%, transparent 45%, rgb(0 0 0 / .45) 100%); pointer-events: none; }
.cover .art { position: absolute; inset: 0; }
.cover .art.grain::before { content: ""; position: absolute; inset: 0; opacity: .18; mix-blend-mode: overlay; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E"); }
.cover .rings { position: absolute; right: -12vw; top: -18vw; width: 62vw; height: 62vw; border-radius: 50%; border: 1px solid rgb(255 255 255 / .18); box-shadow: 0 0 0 7vw rgb(255 255 255 / .04), 0 0 0 14vw rgb(255 255 255 / .03); pointer-events: none; }
.cover .in { position: relative; z-index: 2; width: 100%; max-width: 1200px; margin: 0 auto; padding: 120px 24px 72px; animation: rise .9s cubic-bezier(.2,.8,.2,1) both; }
.cover .for { display: inline-flex; gap: 8px; align-items: center; font-weight: 650; font-size: .95rem; padding: 7px 14px; border-radius: 99px; background: rgb(255 255 255 / .15); backdrop-filter: blur(8px); margin-bottom: 24px; }
.cover h1 { font-size: clamp(2.6rem, 7.4vw, 6rem); font-weight: 800; letter-spacing: -0.035em; line-height: .98; max-width: 16ch; margin: 0 0 24px; text-wrap: balance; }
.cover p.sub { font-size: clamp(1.1rem, 2vw, 1.4rem); max-width: 36rem; opacity: .92; margin: 0 0 36px; text-wrap: pretty; }
.cover .meta { display: flex; gap: 10px 28px; flex-wrap: wrap; font-size: .92rem; opacity: .9; }
.cover .meta span { display: inline-flex; gap: 8px; align-items: center; }
.cover .scroll { position: absolute; z-index: 2; left: 50%; bottom: 22px; translate: -50% 0; color: #fff; opacity: .7; animation: bob 2.4s ease-in-out infinite; }
@keyframes rise { from { opacity: 0; transform: translateY(24px); } }
@keyframes bob { 50% { transform: translateY(6px); } }

.doc-body { max-width: 780px; margin: 0 auto; padding: 24px 24px 160px; }
.doc-sec { padding: 72px 0 0; }
.doc-sec > .kicker { display: flex; gap: 12px; align-items: center; color: var(--accent-ink); font: 700 .8rem var(--font); letter-spacing: .14em; text-transform: uppercase; margin-bottom: 14px; }
.doc-sec > .kicker::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.doc-sec > h2 { font-size: clamp(1.8rem, 4vw, 2.5rem); font-weight: 780; letter-spacing: -0.025em; margin-bottom: 18px; }
.doc-sec .prose { font-size: 1.12rem; line-height: 1.72; max-width: none; }
.doc-sec .prose > :last-child { margin-bottom: 0; }
.doc-sec .lede { color: var(--muted); font-size: 1.08rem; margin: -6px 0 22px; }
.doc-img { margin: 0; border-radius: 20px; overflow: hidden; }
.doc-img img { display: block; width: 100%; }
.prose a { color: var(--accent-ink); text-decoration-thickness: 2px; text-underline-offset: 3px; }
.prose ul, .prose ol { padding-left: 1.3em; }
.prose li { margin: .35em 0; }
.prose li::marker { color: var(--accent); font-weight: 700; }
.prose h3 { font-size: 1.2rem; margin-top: 1.6em; }
.prose h3:first-child { margin-top: 0; }
.prose blockquote { margin: 1.5em 0; padding: 16px 22px; border-radius: 14px; background: var(--accent-soft); }
.prose strong { font-weight: 700; }

/* Line items the client can change */
.lines { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--surface); }
.line { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 16px; align-items: center; padding: 18px 22px; border-bottom: 1px solid var(--line); transition: background .2s, opacity .2s; }
.line:last-child { border-bottom: 0; }
.line .name { font-weight: 650; font-size: 1.04rem; }
.line .desc { color: var(--muted); font-size: .93rem; grid-column: 2; }
.line .price { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.line .price small { display: block; font-weight: 500; color: var(--muted); font-size: .8rem; }
.line .ctl { grid-column: 2 / -1; display: flex; gap: 10px; align-items: center; margin-top: 8px; }
.line.off { opacity: .55; }
.line.off .price { text-decoration: line-through; text-decoration-color: var(--line-strong); }
.line .lead { width: 26px; display: grid; place-items: center; }
.line .lead .icon { color: var(--accent); width: 20px; height: 20px; }
.toggle { position: relative; width: 44px; height: 26px; flex: none; display: inline-block; cursor: pointer; }
.toggle input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; z-index: 1; }
.toggle i { position: absolute; inset: 0; border-radius: 99px; background: var(--line-strong); transition: background .2s; }
.toggle i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / .25); transition: transform .25s cubic-bezier(.2,.8,.2,1); }
.toggle input:checked + i { background: var(--accent); }
.toggle input:checked + i::after { transform: translateX(18px); }
.toggle input:focus-visible + i { outline: 3px solid var(--accent); outline-offset: 2px; }
.stepper { display: inline-flex; align-items: center; border: 1px solid var(--line-strong); border-radius: 12px; overflow: hidden; background: var(--surface); }
.stepper button { width: 36px; height: 36px; border: 0; background: none; color: var(--ink); font-size: 1.15rem; cursor: pointer; }
.stepper button:hover { background: var(--surface-2); }
.stepper input { width: 52px; border: 0; border-radius: 0; text-align: center; padding: 6px 0; font-weight: 650; font-variant-numeric: tabular-nums; -moz-appearance: textfield; }
.stepper input::-webkit-inner-spin-button { -webkit-appearance: none; }
.stepper + .u { color: var(--muted); font-size: .9rem; }

/* Packages: choose one */
.packages { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
.pkg { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 24px 22px 22px; border: 1.5px solid var(--line); border-radius: 20px; background: var(--surface); cursor: pointer; transition: border-color .2s, box-shadow .2s, transform .2s; }
.pkg:hover { border-color: var(--line-strong); transform: translateY(-2px); }
.pkg input { position: absolute; opacity: 0; pointer-events: none; }
.pkg .nm { font-weight: 750; font-size: 1.15rem; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.pkg .radio { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--line-strong); display: grid; place-items: center; color: var(--on-accent); transition: all .2s; flex: none; }
.pkg .radio .icon { width: 14px; height: 14px; stroke-width: 3; opacity: 0; }
.pkg .pr { font-size: 1.9rem; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.pkg .pr small { font-size: .9rem; font-weight: 550; color: var(--muted); letter-spacing: 0; }
.pkg .ds { color: var(--muted); font-size: .93rem; }
.pkg .rec { position: absolute; top: -11px; left: 20px; }
.pkg:has(input:checked) { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft), var(--shadow); }
.pkg:has(input:checked) .radio { background: var(--accent); border-color: var(--accent); }
.pkg:has(input:checked) .radio .icon { opacity: 1; }
.pkg:has(input:focus-visible) { outline: 3px solid var(--accent); outline-offset: 3px; }
.locked .pkg { cursor: default; }
.locked .pkg:not(:has(input:checked)) { display: none; }
.locked .line.off { display: none; }

/* Totals */
.summary { border-radius: 22px; background: var(--ink); color: var(--bg); padding: 30px; display: grid; gap: 4px; }
.summary .row2 { display: flex; justify-content: space-between; gap: 16px; font-variant-numeric: tabular-nums; padding: 5px 0; color: color-mix(in oklab, var(--bg) 75%, transparent); }
.summary .total { border-top: 1px solid color-mix(in oklab, var(--bg) 20%, transparent); margin-top: 10px; padding-top: 16px; color: var(--bg); align-items: baseline; }
.summary .total b { font-size: clamp(2rem, 5vw, 2.8rem); font-weight: 800; letter-spacing: -0.03em; }
.summary .sub-total { color: var(--bg); font-weight: 650; }
.summary h3 { margin: 18px 0 4px; font-size: .78rem; text-transform: uppercase; letter-spacing: .12em; color: color-mix(in oklab, var(--bg) 60%, transparent); }
.summary h3:first-child { margin-top: 0; }
.summary .deposit { margin-top: 14px; padding: 12px 16px; border-radius: 12px; background: color-mix(in oklab, var(--bg) 10%, transparent); color: var(--bg); display: flex; justify-content: space-between; font-weight: 650; }

/* Questions */
.qa { display: grid; gap: 14px; }
.qa .q { border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; background: var(--surface); }
.qa .q p { margin: 0; }
.qa .q .who { color: var(--muted); font-size: .82rem; margin-bottom: 4px; }
.qa .a { margin-top: 14px; padding: 12px 16px; border-radius: 12px; background: var(--accent-soft); }
.qa .a .who { color: var(--accent-ink); font-weight: 650; }
.qa .pending { margin-top: 10px; color: var(--muted); font-size: .85rem; }
.ask { display: grid; gap: 10px; margin-top: 6px; }
.ask .grid-2 { gap: 10px; }

/* Accept */
.accept-card { margin-top: 80px; border-radius: 28px; padding: clamp(28px, 6vw, 56px); text-align: center; color: #fff; position: relative; overflow: hidden; }
.accept-card .art { position: absolute; inset: 0; }
.accept-card > * { position: relative; }
.accept-card h2 { font-size: clamp(2rem, 5vw, 3rem); font-weight: 800; letter-spacing: -0.03em; }
.accept-card .tot { font-size: 1.15rem; opacity: .92; margin-bottom: 26px; }
.accept-card .btn.primary { background: #fff; color: #111; }
.accept-card .link { color: rgb(255 255 255 / .8); display: inline-block; margin-top: 16px; }
.decided { border: 1px solid var(--line); border-radius: 22px; padding: 28px; display: grid; gap: 16px; background: var(--surface); }
.decided .head { display: flex; gap: 14px; align-items: center; }
.decided .seal { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: var(--good); color: #fff; box-shadow: 0 0 0 8px color-mix(in oklab, var(--good) 18%, transparent); flex: none; }
.decided .seal.bad { background: var(--bad); box-shadow: 0 0 0 8px color-mix(in oklab, var(--bad) 18%, transparent); }
.decided h2 { margin: 0; font-size: 1.5rem; }
.sig { font: 600 2.6rem/1.1 var(--script); color: var(--ink); padding: 8px 0 6px; border-bottom: 1.5px solid var(--line-strong); max-width: 26rem; overflow: hidden; }
.sig svg { width: 100%; max-width: 26rem; height: auto; display: block; }
.sig svg path { fill: none; stroke: var(--ink); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
.fp { font: .78rem var(--mono); color: var(--muted); word-break: break-all; }
.closed { text-align: center; padding: 28px; border-radius: 20px; background: var(--surface-2); margin-top: 60px; }

/* The sticky bar */
.dock { position: fixed; z-index: 30; left: 50%; bottom: 18px; translate: -50% 140%; width: min(760px, calc(100% - 24px)); display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 12px 12px 12px 24px; border-radius: 20px; background: color-mix(in oklab, var(--ink) 94%, transparent); color: var(--bg); box-shadow: 0 20px 50px -12px rgb(0 0 0 / .45); backdrop-filter: blur(12px); transition: translate .45s cubic-bezier(.2,.8,.2,1); }
.dock.on { translate: -50% 0; }
.dock .sum { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.dock .sum b { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.dock .sum span { font-size: .8rem; opacity: .7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dock .btn.primary { padding: 14px 22px; }
.bump { animation: bump .35s ease; }
@keyframes bump { 40% { transform: scale(1.06); } }

/* Accept dialog */
dialog.sheet { border: 0; padding: 0; border-radius: 24px; width: min(560px, calc(100% - 24px)); background: var(--surface); color: var(--ink); box-shadow: 0 30px 80px -20px rgb(0 0 0 / .5); }
dialog.sheet::backdrop { background: rgb(20 18 15 / .55); backdrop-filter: blur(4px); }
dialog.sheet[open] { animation: rise .35s cubic-bezier(.2,.8,.2,1); }
dialog.sheet form { padding: 28px; display: grid; gap: 4px; }
dialog.sheet h2 { margin: 0 0 4px; font-size: 1.5rem; }
dialog.sheet .tot { color: var(--muted); margin: 0 0 18px; }
dialog.sheet .close { position: absolute; top: 14px; right: 14px; }
.sigpad { position: relative; border: 1.5px dashed var(--line-strong); border-radius: 14px; background: var(--bg); height: 150px; overflow: hidden; }
.sigpad canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: crosshair; }
.sigpad .typed { position: absolute; inset: 0; display: grid; place-items: center; font: 600 3rem/1 var(--script); color: var(--ink); padding: 0 16px; text-align: center; overflow: hidden; pointer-events: none; }
.sigpad .base { position: absolute; left: 24px; right: 24px; bottom: 34px; border-bottom: 1px solid var(--line-strong); pointer-events: none; }
.sigpad .x { position: absolute; left: 24px; bottom: 38px; color: var(--muted); font-weight: 700; pointer-events: none; }
.sig-tabs { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.err { color: var(--bad); font-size: .9rem; min-height: 1.2em; margin: 6px 0 0; }
#confetti { position: fixed; inset: 0; pointer-events: none; z-index: 60; }
@media (max-width: 560px) {
  .line { padding: 16px; }
  .dock { padding-left: 18px; bottom: 10px; }
  .dock .sum b { font-size: 1.1rem; }
  .summary { padding: 22px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
@media print {
  .doc-top, .dock, .ask, .accept-card, .scroll, .no-print, .site-header, footer.site { display: none !important; }
  .cover { min-height: 0; }
}
`;
