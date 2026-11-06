import { requireAdmin } from './auth';
import type { Env } from './env';
import { HttpError, PUBLIC_CACHE, errorResponse, json, notFound, preflight, readJsonObject, withCors } from './http';
import { SLUG_RE } from './validate';
import * as media from './content/media';
import * as pages from './content/pages';
import * as posts from './content/posts';
import * as settings from './content/settings';

export type { Env } from './env';

type Params = Record<string, string>;
type Handler = (req: Request, env: Env, params: Params, url: URL) => Promise<Response>;

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string[];
  admin: boolean;
  handler: Handler;
}

const routes: Route[] = [];
const route = (method: Route['method'], path: string, handler: Handler) =>
  routes.push({ method, path: path.split('/').filter(Boolean), admin: path.startsWith('/api/admin'), handler });

const publicSlug = (raw: string | undefined) => {
  if (!raw || !SLUG_RE.test(raw)) throw notFound();
  return raw;
};

const noContent = () => new Response(null, { status: 204 });

// ---------- Public, read-only API (published content only) ----------

route('GET', '/api/health', async (_req, env) => {
  await env.DB.prepare('SELECT 1').first();
  return json({ ok: true });
});

route('GET', '/api/settings', async (_req, env) => json(await settings.getSettings(env.DB), { cache: PUBLIC_CACHE }));

route('GET', '/api/pages', async (_req, env) => json({ data: await pages.listPublishedPages(env.DB) }, { cache: PUBLIC_CACHE }));
route('GET', '/api/pages/:slug', async (_req, env, p) =>
  json(await pages.getPublishedPage(env.DB, publicSlug(p.slug)), { cache: PUBLIC_CACHE }),
);

route('GET', '/api/posts', async (_req, env, _p, url) => json(await posts.listPublishedPosts(env.DB, url), { cache: PUBLIC_CACHE }));
route('GET', '/api/post-categories', async (_req, env) =>
  json({ data: await posts.listPostCategories(env.DB) }, { cache: PUBLIC_CACHE }),
);
route('GET', '/api/posts/:slug', async (_req, env, p) =>
  json(await posts.getPublishedPost(env.DB, publicSlug(p.slug)), { cache: PUBLIC_CACHE }),
);

route('GET', '/media/*', async (req, env, p) => media.serveMedia(req, env, p['*']!));

// ---------- Admin API (Bearer ADMIN_TOKEN, same-origin only) ----------

route('GET', '/api/admin/me', async () => json({ ok: true }));

route('GET', '/api/admin/settings', async (_req, env) => json(await settings.getSettings(env.DB)));
route('PUT', '/api/admin/settings', async (req, env) => json(await settings.putSettings(env.DB, await readJsonObject(req))));

route('GET', '/api/admin/pages', async (_req, env) => json({ data: await pages.listAdminPages(env.DB) }));
route('POST', '/api/admin/pages', async (req, env) => json(await pages.createPage(env.DB, await readJsonObject(req)), { status: 201 }));
route('GET', '/api/admin/pages/:id', async (_req, env, p) => json(await pages.getAdminPage(env.DB, p.id)));
route('PUT', '/api/admin/pages/:id', async (req, env, p) => json(await pages.updatePage(env.DB, p.id, await readJsonObject(req))));
route('DELETE', '/api/admin/pages/:id', async (_req, env, p) => {
  await pages.deletePage(env.DB, p.id);
  return noContent();
});

route('GET', '/api/admin/posts', async (_req, env) => json({ data: await posts.listAdminPosts(env.DB) }));
route('POST', '/api/admin/posts', async (req, env) => json(await posts.createPost(env.DB, await readJsonObject(req)), { status: 201 }));
route('GET', '/api/admin/posts/:id', async (_req, env, p) => json(await posts.getAdminPost(env.DB, p.id)));
route('PUT', '/api/admin/posts/:id', async (req, env, p) => json(await posts.updatePost(env.DB, p.id, await readJsonObject(req))));
route('DELETE', '/api/admin/posts/:id', async (_req, env, p) => {
  await posts.deletePost(env.DB, p.id);
  return noContent();
});

route('GET', '/api/admin/media', async (_req, env, _p, url) => json({ data: await media.listMedia(env, url.origin) }));
route('POST', '/api/admin/media', async (req, env, _p, url) => json(await media.uploadMedia(req, env, url.origin), { status: 201 }));
route('PUT', '/api/admin/media/*', async (req, env, p, url) =>
  json(await media.updateMedia(env, p['*']!, await readJsonObject(req), url.origin)),
);
route('DELETE', '/api/admin/media/*', async (_req, env, p) => {
  await media.deleteMedia(env, p['*']!);
  return noContent();
});

// ---------- Dispatch ----------

function match(pattern: string[], segments: string[]): Params | null {
  const params: Params = {};
  for (let i = 0; i < pattern.length; i++) {
    const part = pattern[i]!;
    if (part === '*') {
      const rest = segments.slice(i);
      if (!rest.length) return null;
      params['*'] = rest.join('/');
      return params;
    }
    const seg = segments[i];
    if (seg === undefined) return null;
    if (part.startsWith(':')) params[part.slice(1)] = seg;
    else if (part !== seg) return null;
  }
  return segments.length === pattern.length ? params : null;
}

function decodeSegments(pathname: string): string[] | null {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}

async function dispatch(req: Request, env: Env, url: URL): Promise<Response> {
  let segments = decodeSegments(url.pathname);
  if (!segments) throw notFound();
  // The storefront reaches the public API as /cms/api/… and /cms/media/… (same-origin proxy, service binding).
  if (segments[0] === 'cms' && (segments[1] === 'api' || segments[1] === 'media')) segments = segments.slice(1);
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const isApi = segments[0] === 'api' || segments[0] === 'media';

  if (!isApi) {
    if (url.pathname === '/' && method === 'GET') return Response.redirect(`${url.origin}/admin/`, 302);
    return env.ASSETS.fetch(req);
  }

  const isAdmin = segments[0] === 'api' && segments[1] === 'admin';
  if (method === 'OPTIONS' && !isAdmin) return preflight();

  const allowed: string[] = [];
  for (const r of routes) {
    const params = match(r.path, segments);
    if (!params) continue;
    if (r.method !== method) {
      allowed.push(r.method);
      continue;
    }
    if (r.admin) await requireAdmin(req, env);
    const res = await r.handler(req, env, params, url);
    return r.admin ? res : withCors(res);
  }
  if (allowed.length) {
    throw new HttpError(405, 'method_not_allowed', `Méthode non permise ; utilisez ${allowed.join(' ou ')}`);
  }
  throw notFound('Point d’accès');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const url = new URL(req.url);
    const requestId = req.headers.get('cf-ray') ?? crypto.randomUUID();
    let res: Response;
    try {
      res = await dispatch(req, env, url);
    } catch (err) {
      if (err instanceof HttpError) {
        res = errorResponse(err, requestId);
        if (!url.pathname.startsWith('/api/admin')) res = withCors(res);
      } else {
        console.error(
          JSON.stringify({
            msg: 'unhandled_error',
            request_id: requestId,
            method: req.method,
            path: url.pathname,
            error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
          }),
        );
        res = errorResponse(new HttpError(500, 'internal', 'Une erreur est survenue'), requestId);
      }
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
      console.log(
        JSON.stringify({ msg: 'request', request_id: requestId, method: req.method, path: url.pathname, status: res.status, ms: Date.now() - started }),
      );
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
