// Builds the app: the server into dist/ as one file per entry, the two page scripts into
// dist/public, and the fonts into dist/fonts (woff2 for pages, TTF for the PDF).
import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

await rm("dist", { recursive: true, force: true });
await mkdir("dist/fonts", { recursive: true });

await build({
  entryPoints: ["src/index.ts", "src/migrate.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // The PDF compiler is a native module and Sentry loads its own hooks; both stay in node_modules.
  external: ["@myriaddreamin/*", "@sentry/node"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  define: { __BUILD__: JSON.stringify(stamp) },
  logLevel: "warning",
});

await build({
  entryPoints: { proposal: "src/client/proposal.ts", staff: "src/client/staff.ts" },
  outdir: "dist/public",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["es2022", "safari16"],
  minify: true,
  logLevel: "warning",
});

const fonts = [
  ["@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2"],
  ["@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2"],
  ["@fontsource-variable/figtree/files/figtree-latin-wght-italic.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2"],
  ["@fontsource/caveat/files/caveat-latin-600-normal.woff2"],
  ["@fontsource/caveat/files/caveat-latin-ext-600-normal.woff2"],
  ["@expo-google-fonts/figtree/400Regular/Figtree_400Regular.ttf", "Figtree-400.ttf"],
  ["@expo-google-fonts/figtree/400Regular_Italic/Figtree_400Regular_Italic.ttf", "Figtree-400i.ttf"],
  ["@expo-google-fonts/figtree/600SemiBold/Figtree_600SemiBold.ttf", "Figtree-600.ttf"],
  ["@expo-google-fonts/figtree/700Bold/Figtree_700Bold.ttf", "Figtree-700.ttf"],
  ["@expo-google-fonts/figtree/800ExtraBold/Figtree_800ExtraBold.ttf", "Figtree-800.ttf"],
  ["@expo-google-fonts/caveat/600SemiBold/Caveat_600SemiBold.ttf", "Caveat-600.ttf"],
];
await Promise.all(fonts.map(([from, to]) => copyFile(`node_modules/${from}`, `dist/fonts/${to ?? from.split("/").pop()}`)));
