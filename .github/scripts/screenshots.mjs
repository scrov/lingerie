// Screenshots of the storefront container running on http://localhost:8080, with the local CMS on :8787
// (see the web job in deploy.yml). Static files come from dist/browser, as the front Worker serves them in production.
// Saved to ./screenshots; with PRINT_SCREENSHOTS=1 each JPEG is also printed to the log as base64.
import { access, mkdir, readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const BASE = 'http://localhost:8080';
const CMS = 'http://localhost:8787';
const DIST = 'dist/browser';
const OUT = 'screenshots';
await mkdir(OUT, { recursive: true });

let pages = [];
try {
  const res = await fetch(`${CMS}/api/pages`);
  const text = await res.text();
  console.log(`CMS /api/pages: ${res.status}, ${text.length} bytes`);
  pages = JSON.parse(text).data ?? [];
} catch (e) {
  console.log(`CMS /api/pages failed: ${e}`);
}
const product = pages.find((p) => p.nav_section === 'produits');
const home = await fetch(BASE + '/').then((r) => r.text());
console.log(`Server-rendered home: ${home.length} bytes, menu-produits ${home.includes('menu-produits') ? 'present' : 'MISSING'}`);

const browser = await chromium.launch({ channel: 'chrome' });
const shots = [];
const errors = []; // uncaught exceptions: fail the step
const warnings = []; // console errors (e.g. a third-party resource): reported only

async function open(name, viewport, path, before) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'fr-CA', reducedMotion: 'no-preference' });
  // Files with an extension (JS, CSS, images…) are static assets: serve them from the build, like the front Worker.
  await context.route(`${BASE}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (/\.[a-z0-9]+$/i.test(path) && !path.startsWith('/cms/')) {
      const file = join(DIST, normalize(path));
      try {
        await access(file);
        return route.fulfill({ path: file });
      } catch {
        return route.fulfill({ status: 404, body: 'not found' });
      }
    }
    return route.continue();
  });
  await context.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ status: 204, body: '' }));
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

async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    errors.push(`${name}: ${e.message.split('\n')[0]}`);
  }
}

await step('desktop', async () => {
  const { page, context } = await open('home-desktop', desktop, '/');
  await scrollThrough(page);
  await shot('home-desktop', page, { fullPage: true });
  await page.hover('button[aria-controls="menu-produits"]', { timeout: 5000 });
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
});
await step('mobile', async () => {
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
});
if (product) {
  await step('product', async () => {
    const { page, context } = await open('product', desktop, `/page/${product.slug}`);
    await scrollThrough(page);
    await shot('product-desktop', page, { fullPage: true });
    await context.close();
  });
}

// Consent banner: configure a (fake) Google Analytics ID in the local CMS so the banner appears.
if (process.env.CMS_ADMIN_TOKEN) {
  const put = await fetch(`${CMS}/api/admin/settings`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${process.env.CMS_ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ga4_id: 'G-SCREENSHOT1', meta_pixel_id: '123456789012345' }),
  });
  console.log(`Configured tracking IDs in the local CMS: ${put.status}`);
  await step('consent', async () => {
    const { page, context } = await open('consent', mobile, '/');
    await page.waitForSelector('[aria-labelledby="consent-title"]', { timeout: 8000 });
    await page.waitForTimeout(700);
    await shot('consent-banner', page);
    await page.getByRole('button', { name: 'Personnaliser' }).click();
    await page.waitForTimeout(600);
    await shot('consent-preferences', page);
    await page.getByRole('button', { name: 'Tout accepter' }).last().click();
    await page.waitForTimeout(500);
    const loaded = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => s.includes('googletagmanager') || s.includes('fbevents')));
    console.log(`After « Tout accepter »: ${loaded.join(', ') || 'no tag loaded'}`);
    await context.close();
  });
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
