# Lingerie & Maillots Christine

Website for the lingerie and swimwear boutique in Saint-Jérôme, QC, replacing the old MaPlateforme site.
Everything runs on Cloudflare.

```
apps/
  web/     Angular 22 storefront, server-rendered     → Worker "lingerie" + Container → https://lingerie.scrov.app
  cms/     Content API + admin (in French)             → Worker "lingerie-cms"         → https://lingerie-cms.scrov.app
legacy/
  lingeriechristine.ca/   Snapshot of the old site's HTML (not deployed). Its content was imported into the CMS.
```

```
Browser ──▶ lingerie.scrov.app
              ├─ static file (JS, CSS, /uploads/…)? ──▶ served from the edge (Workers Static Assets)
              ├─ /cms/api/…, /cms/media/… ──▶ Worker "lingerie" ──service binding──┐
              └─ page ──▶ Worker "lingerie" ──▶ Durable Object ──▶ Container: Angular SSR on Node
                                                                       │ http://cms.internal (intercepted)
                                                                       ▼
                                                  service binding ──▶ lingerie-cms ──▶ D1 "lingerie-cms"   (pages, posts, settings)
                                                                                    └─▶ R2 "lingerie-media" (uploaded images)
```

The storefront never calls `lingerie-cms.scrov.app` over the internet: the scrov.app zone answers non-browser
clients there with a Cloudflare challenge. The container's requests to `http://cms.internal` are handed to the
`CMS` service binding by the front Worker, and browsers read the same API at `/cms/…` on the storefront's own domain.

## What's where

**Content (CMS).** The admin at `https://lingerie-cms.scrov.app/admin/` has five sections:

- **Pages** — product category pages (« Produits » menu), the team page, any other page. Each has a menu section
  (`produits`, `equipe`, or none), a header image and rich-text content. Pages live at `/page/<slug>`.
- **Blogue** — articles with a cover image, category and publication date (a future date schedules the post).
  Articles live at `/blog/<slug>`.
- **Médias** — image library stored in R2.
- **Réglages** — business name, phone, address, opening hours, social links, home page headline, intro text,
  hero image and gallery, announcement bar.
- **Confidentialité** — cookie consent banner (texts, « ask everyone again »), which pages are the privacy policy and
  the terms of use, Google Analytics 4 / Google Ads / Google Tag Manager / Meta pixel IDs, site ownership verification
  codes (Google, Bing, Meta), default search description and share image, and a « don't index » switch.
  Measurement and advertising tools load only after the visitor accepts (opt-in, Google Consent Mode v2); with no
  tool configured there is no banner and no tracking at all. The privacy policy and terms of use start as **drafts**
  with « À compléter » passages: complete them, then publish them from Pages.

The old site's 25 blog posts, home page text, contact details and hours are already imported. The eight menu pages
(Soutiens-gorge, Maillots de bain, …, Notre équipe) exist as **drafts** with the old URLs: their text wasn't in the
scraped copy, so paste it in and publish each one. A section appears in the menu as soon as one of its pages is published.

URLs from the old site keep working: `/page/…` and `/blog/…` are unchanged, and `index.html`, `blog.html`,
`…/index.html` and trailing-slash addresses redirect permanently. `/rss.xml` and `/sitemap.xml` are generated from the CMS.

**Storefront (`apps/web`).** `src/app/cms/` is the API client, `src/app/pages/` the routes, `src/app/layout/` the
header (with the « Produits » menu) and footer, `src/app/privacy/` the cookie banner and consent-gated tags,
`src/app/shared/` shared pieces. Styling is Tailwind CSS v4 with shadcn/ui-style tokens in `src/styles.css`. Every route is rendered on the server per request, so CMS edits show up on the next page load.

**CMS (`apps/cms`).** A dependency-free Worker: `src/` is the API, `public/admin/` the admin UI (plain JS),
`migrations/` the D1 schema, `seed/legacy-content.sql` the imported content, `test/` API tests.

## Setup

Node 22.22+ or 24.15+. Each app has its own dependencies:

```sh
npm run install:all
```

## Deploy

Both Workers deploy from the `prod` branch with **Cloudflare Workers Builds** (each Worker → Settings → Build). Every
push to `prod` rebuilds and redeploys them. (`main` is the live site served by the separate `lc` Worker; nothing here
deploys from it.)

| Setting | `lingerie` (storefront) | `lingerie-cms` (CMS) |
| --- | --- | --- |
| Git repository | `scrov/lingerie` | `scrov/lingerie` |
| Branch control › Production branch | `prod` | `prod` |
| Root directory | `apps/web` | `apps/cms` |
| Build command | `npm run build` | *(empty)* |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy` |

The storefront deploy uploads the Worker with the static files from `dist/browser`, builds `apps/web/Dockerfile`,
pushes the image to Cloudflare's registry and replaces the running container. If a deploy fails on the container step
with a permissions error, edit the build token (My Profile → API Tokens) and add **Account › Containers › Edit**.

The CMS admin password is a secret on the `lingerie-cms` Worker: Settings → Variables and Secrets → add `ADMIN_TOKEN`
(type Secret), a long random string such as the output of `openssl rand -base64 32`. Schema changes are not applied by
Workers Builds: run `npx wrangler d1 migrations apply lingerie-cms --remote` in `apps/cms` after adding a migration.

Containers need the **Workers Paid** plan. The first container deploy can take a few minutes to come up.

GitHub Actions (`.github/workflows/deploy.yml`) type-checks, tests and builds both apps and smoke-tests the container on
every push and pull request. It can also deploy everything itself (migrations included) if you add the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets; the token needs the **Edit Cloudflare Workers**
template plus **Account › Containers › Edit** and **Account › D1 › Edit**. Use one deploy path or the other: if you
add the secrets, disconnect Workers Builds from both Workers so they don't deploy over each other.

**How the storefront runs.** Requests for files in `dist/browser` never reach the Worker. Everything else goes through
`apps/web/worker/index.ts` to one container instance (¼ vCPU, 1 GiB, in eastern North America) running
`dist/server/server.mjs`. A cron trigger pings it every 5 minutes so visitors don't wait for a cold start; it costs one
small instance running around the clock. To let it sleep after 30 idle minutes instead, remove `triggers` from
`apps/web/wrangler.jsonc` (the first visit after that waits a few seconds). If the container is down, visitors get a
short "the site is updating" page with the shop's phone number.

**Deploying by hand** works too, with Docker running:

```sh
cd apps/cms && npx wrangler d1 migrations apply lingerie-cms --remote && npx wrangler deploy
cd ../web && npm run deploy          # ng build + wrangler deploy (builds and pushes the container image)
```

Both custom domains need the `scrov.app` zone to be on the same Cloudflare account. If `lingerie.scrov.app` is already
attached elsewhere, Wrangler will say so; detach it there first.

**Recommended:** put Cloudflare Access (Zero Trust → Access → Applications) in front of
`lingerie-cms.scrov.app/admin*` and `lingerie-cms.scrov.app/api/admin*`. The public API (`/api/…`) and `/media/…`
must stay open for the storefront.

## Develop

```sh
# CMS on http://localhost:8787 with a local D1/R2
cd apps/cms
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply lingerie-cms --local
npx wrangler d1 execute lingerie-cms --local --file seed/legacy-content.sql
npx wrangler d1 execute lingerie-cms --local --file seed/product-pages.sql
npm run dev

# Storefront on http://localhost:4200, reading the local CMS (without the variable it reads the production CMS)
cd apps/web && CMS_INTERNAL_URL=http://localhost:8787 npm start
```

Tests:

```sh
npm run test:cms                 # API tests on node:sqlite + in-memory R2, no Cloudflare account needed
npm --prefix apps/web test       # Angular unit tests (Vitest)
```

The container itself: `cd apps/web && npx ng build && docker build -t storefront . && docker run -p 8080:8080
--add-host=host.docker.internal:host-gateway -e CMS_INTERNAL_URL=http://host.docker.internal:8787 storefront`, then open
http://localhost:8080 (pages render; static files are served by the Worker in production, so styles are missing here).

CI does the same with the seed content, then takes screenshots (home, menus, lightbox, a product page, the consent
banner) and uploads them as the `screenshots` artifact of each run.

Schema changes: add `apps/cms/migrations/000N_name.sql`, then `npx wrangler d1 migrations apply lingerie-cms --remote`.
