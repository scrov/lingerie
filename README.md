# Lingerie & Maillots Christine

Website for the lingerie and swimwear boutique in Saint-Jérôme, QC, replacing the old MaPlateforme site.
Everything runs on Cloudflare.

```
apps/
  web/     Angular 22 storefront, server-rendered     → Worker "lingerie"      → https://lingerie.scrov.app
  cms/     Content API + admin (in French)             → Worker "lingerie-cms"  → https://lingerie-cms.scrov.app
legacy/
  lingeriechristine.ca/   Snapshot of the old site's HTML (not deployed). Its content was imported into the CMS.
```

```
Browser ──▶ lingerie (Angular SSR) ──fetch──▶ lingerie-cms ──▶ D1  "lingerie-cms"   (pages, posts, settings)
   │                                                     └──▶ R2  "lingerie-media" (images uploaded in the admin)
   └──▶ /uploads/…  static images from the old site, served by the storefront
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

Node 22+. Each app has its own dependencies:

```sh
npm run install:all
```

## Deploy

The D1 database, R2 bucket, schema and imported content are already in place on the Cloudflare account.

```sh
# 1. CMS
cd apps/cms
npx wrangler login
npx wrangler secret put ADMIN_TOKEN    # a long random string, e.g. `openssl rand -base64 32`; this is the admin password
npx wrangler deploy                    # also attaches lingerie-cms.scrov.app

# 2. Storefront
cd ../web
npm run deploy                         # ng build + wrangler deploy; attaches lingerie.scrov.app to the "lingerie" Worker
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

Schema changes: add `apps/cms/migrations/000N_name.sql`, then `npx wrangler d1 migrations apply lingerie-cms --remote`.
