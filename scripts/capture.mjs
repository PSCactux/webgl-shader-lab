// Opens every effect page in headless Chromium, reports console errors and
// saves a screenshot per effect. Used to generate the gallery thumbnails.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/capture.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";

const base = process.argv[2] ?? "http://localhost:4173/";
const out = process.argv[3] ?? "shots";
const only = process.argv[4]?.split(",");
await mkdir(out, { recursive: true });

const registry = await readFile(new URL("../src/effects/registry.ts", import.meta.url), "utf8");
let slugs = [...registry.matchAll(/slug: "([\w-]+)"/g)].map((m) => m[1]);
if (only) slugs = slugs.filter((s) => only.includes(s));

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=metal", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

await page.goto(base);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/_gallery.png` });

for (const slug of slugs) {
  problems.length = 0;
  await page.goto(`${base}#/fx/${slug}`);
  await page.waitForTimeout(1500);
  // Move the pointer a little so interactive effects show their response
  // (but keep it off the word in Particle Morph, where it would punch a hole).
  const [x, y] = slug === "particle-morph" ? [1100, 740] : [760, 330];
  await page.mouse.move(x, y, { steps: 8 });
  await page.waitForTimeout(2500);
  const fps = await page.locator(".fps").textContent().catch(() => "");
  // Hide the UI chrome for a clean thumbnail.
  await page.addStyleTag({ content: ".hud,.pager,.lil-gui,.fps,.reticle,.readout{display:none!important}" });
  await page.screenshot({ path: `${out}/${slug}.png` });
  console.log(`${slug.padEnd(16)} ${fps?.padEnd(8)} ${problems.length ? "\n  " + problems.join("\n  ") : "ok"}`);
}

// WebGL contexts must not pile up when navigating between effects.
const contexts = await page.evaluate(() => document.querySelectorAll("canvas").length);
console.log(`canvases in DOM after visiting all effects: ${contexts}`);
await browser.close();
