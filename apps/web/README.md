# Storefront (`apps/web`)

Angular 22 with server-side rendering on Cloudflare Workers. Content comes from the CMS Worker in `../cms`;
see the root README for the overall setup and deployment.

| Command | |
| --- | --- |
| `npm start` | Dev server on http://localhost:4200 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Build, then run the Worker locally with `wrangler dev` |
| `npm run deploy` | Build and deploy the `lingerie` Worker (lingerie.scrov.app) |
| `npm test` | Unit tests (Vitest) |

```
src/
  server.ts        Worker entry: old-site redirects, /rss.xml, /sitemap.xml, then Angular SSR
  app/cms/         CMS API client, types, small formatting helpers
  app/pages/       One component per route (home, page, blog list, blog post, contact, 404)
  app/shared/      Rich text, post card, address and hours block, SEO helper
public/uploads/    Images from the old site, referenced by imported content as /uploads/…
```
