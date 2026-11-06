// Screenshots of the storefront container running on http://localhost:8080 (see the web job in deploy.yml).
// Saved to ./screenshots; with PRINT_SCREENSHOTS=1 each JPEG is also printed to the log as base64.
import { mkdir, readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const BASE = 'http://localhost:8080';
const OUT = 'screenshots';
await mkdir(OUT, { recursive: true });

const pages = await fetch('https://lingerie-cms.scrov.app/api/pages').then((r) => r.json()).then((r) => r.data).catch(() => []);
const product = pages.find((p) => p.nav_section === 'produits');

const browser = await chromium.launch({ channel: 'chrome' });
const shots = [];
const errors = []; // uncaught exceptions: fail the step
const warnings = []; // console errors (e.g. a third-party resource): reported only

async function open(name, viewport, path, before) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'fr-CA', reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && warnings.push(`${name}: ${m.text()}`));
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  if (before) await before(page);
  return { page, context };
}

/** Scrolls down and back so scroll-revealed elements are shown before a full-page capture. */
async function scrollThrough(page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

async function shot(name, page, opts = {}) {
  const file = `${OUT}/${name}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 62, ...opts });
  shots.push({ name, file });
}

const desktop = { width: 1280, height: 860 };
const mobile = { width: 390, height: 844 };

{
  const { page, context } = await open('home-desktop', desktop, '/');
  await scrollThrough(page);
  await shot('home-desktop', page, { fullPage: true });
  await page.hover('button[aria-controls="menu-produits"]');
  await page.waitForTimeout(700);
  await shot('menu-produits', page, { clip: { x: 0, y: 0, width: 1280, height: 640 } });
  await page.mouse.move(5, 800);
  const first = page.locator('button[aria-label^="Agrandir"]').nth(1);
  if (await first.count()) {
    await first.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await first.click();
    await page.waitForTimeout(800);
    await shot('lightbox', page);
  }
  await context.close();
}
{
  const { page, context } = await open('home-mobile', mobile, '/');
  await scrollThrough(page);
  await shot('home-mobile', page, { fullPage: true });
  await page.click('button[aria-controls="menu-mobile"]');
  await page.waitForTimeout(500);
  const acc = page.locator('button[aria-controls="menu-produits-mobile"]');
  if (await acc.count()) await acc.click();
  await page.waitForTimeout(600);
  await shot('menu-mobile', page);
  await context.close();
}
if (product) {
  const { page, context } = await open('product', desktop, `/page/${product.slug}`);
  await scrollThrough(page);
  await shot('product-desktop', page, { fullPage: true });
  await context.close();
}

await browser.close();

for (const w of warnings) console.log(`::warning::Browser console: ${w}`);
for (const e of errors) console.log(`::error::Uncaught error in the page: ${e}`);
for (const { name, file } of shots) {
  if (process.env.PRINT_SCREENSHOTS !== '1') continue;
  const b64 = (await readFile(file)).toString('base64');
  console.log(`=====BEGIN ${name}=====`);
  for (let i = 0; i < b64.length; i += 4000) console.log(b64.slice(i, i + 4000));
  console.log(`=====END ${name}=====`);
}
console.log(`Saved ${shots.length} screenshots: ${shots.map((s) => s.name).join(', ')}`);
if (errors.length) process.exitCode = 1;
