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
              └─ page ──▶ Worker "lingerie" ──▶ Durable Object ──▶ Container: Angular SSR on Node
                                                                       │ fetch
                                                                       ▼
                                                    lingerie-cms ──▶ D1 "lingerie-cms"   (pages, posts, settings)
                                                                 └─▶ R2 "lingerie-media" (images uploaded in the admin)
```

## What's where

**Content (CMS).** The admin at `https://lingerie-cms.scrov.app/admin/` has four sections:

- **Pages** — product category pages (« Produits » menu), the team page, any other page. Each has a menu section
  (`produits`, `equipe`, or none), a header image and rich-text content. Pages live at `/page/<slug>`.
- **Blogue** — articles with a cover image, category and publication date (a future date schedules the post).
  Articles live at `/blog/<slug>`.
- **Médias** — image library stored in R2.
- **Réglages** — business name, phone, address, opening hours, social links, home page headline, intro text,
  hero image and gallery, announcement bar.

The old site's 25 blog posts, home page text, contact details and hours are already imported. The eight menu pages
(Soutiens-gorge, Maillots de bain, …, Notre équipe) exist as **drafts** with the old URLs: their text wasn't in the
scraped copy, so paste it in and publish each one. A section appears in the menu as soon as one of its pages is published.

URLs from the old site keep working: `/page/…` and `/blog/…` are unchanged, and `index.html`, `blog.html`,
`…/index.html` and trailing-slash addresses redirect permanently. `/rss.xml` and `/sitemap.xml` are generated from the CMS.

**Storefront (`apps/web`).** `src/app/cms/` is the API client, `src/app/pages/` the routes, `src/app/shared/` shared
pieces. Every route is rendered on the server per request, so CMS edits show up on the next page load.

**CMS (`apps/cms`).** A dependency-free Worker: `src/` is the API, `public/admin/` the admin UI (plain JS),
`migrations/` the D1 schema, `seed/legacy-content.sql` the imported content, `test/` API tests.

## Setup

Node 22.22+ or 24.15+. Each app has its own dependencies:

```sh
npm run install:all
```

## Deploy

Both Workers deploy from the `scrov-patch-1` branch with **Cloudflare Workers Builds** (each Worker → Settings →
Build). Every push to that branch rebuilds and redeploys them:

| Setting | `lingerie` (storefront) | `lingerie-cms` (CMS) |
| --- | --- | --- |
| Git repository | `scrov/lingerie` | `scrov/lingerie` |
| Branch control › Production branch | `scrov-patch-1` | `scrov-patch-1` |
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
npm run dev

# Storefront on http://localhost:4200 — point it at the local CMS by providing
# { provide: CMS_URL, useValue: 'http://localhost:8787' } in src/app/app.config.ts
cd apps/web && npm start
```

Tests:

```sh
npm run test:cms                 # API tests on node:sqlite + in-memory R2, no Cloudflare account needed
npm --prefix apps/web test       # Angular unit tests (Vitest)
```

The container itself: `cd apps/web && npx ng build && docker build -t storefront . && docker run -p 8080:8080 storefront`,
then open http://localhost:8080.

Schema changes: add `apps/cms/migrations/000N_name.sql`, then `npx wrangler d1 migrations apply lingerie-cms --remote`.
