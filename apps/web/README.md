# Storefront (`apps/web`)

Angular 22 with server-side rendering. The SSR server runs on Node in a Cloudflare Container behind the `lingerie`
Worker; static files are served by the Worker's static assets. Content comes from the CMS Worker in `../cms`. See the
root README for the overall setup and deployment (GitHub Actions deploys on push).

| Command | |
| --- | --- |
| `npm start` | Dev server on http://localhost:4200 |
| `npm run build` | Production build into `dist/` |
| `npm run serve:ssr:web` | Run the built SSR server on http://localhost:8080 (what the container runs) |
| `npm run preview` | Build, then run the Worker and container locally with `wrangler dev` (needs Docker) |
| `npm run deploy` | Build and deploy the `lingerie` Worker and container (needs Docker) |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck:worker` | Type-check the front Worker in `worker/` |

```
src/
  server.ts        Node SSR server (runs in the container): /healthz, old-site redirects, /rss.xml, /sitemap.xml, then Angular SSR
  app/cms/         CMS API client, types, small formatting helpers
  app/pages/       One component per route (home, page, blog list, blog post, contact, 404)
  app/shared/      Rich text, post card, address and hours block, SEO helper
public/uploads/    Images from the old site, referenced by imported content as /uploads/…
worker/index.ts    Front Worker: forwards page requests to the container through the Storefront Durable Object
Dockerfile         Container image: node:24-alpine + dist/server
wrangler.jsonc     Worker, static assets, container, Durable Object, cron and custom domain
```
