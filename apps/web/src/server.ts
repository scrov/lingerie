import { AngularAppEngine } from '@angular/ssr';
import { createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Storefront SSR server. In production it runs inside a Cloudflare Container (see Dockerfile and
 * worker/index.ts); `ng serve` uses the exported `reqHandler` during development.
 */

/**
 * Where this server reaches the CMS. In the Cloudflare Container it is http://cms.internal, which the front Worker
 * hands to the CMS service binding (worker/index.ts); elsewhere the public address.
 */
const CMS_ORIGIN = new URL(process.env['CMS_INTERNAL_URL'] || 'https://lingerie-cms.scrov.app').origin;
const SITE_NAME = 'Lingerie & Maillots Christine';

/** Read by app.config.server.ts: Angular fetches CMS content from here while rendering. */
export interface SsrContext {
	cmsOrigin: string;
	cmsBase: string;
}
const SSR_CONTEXT: SsrContext = { cmsOrigin: CMS_ORIGIN, cmsBase: `${CMS_ORIGIN}/cms` };

/** Canonical public address. Requests for any other host are rendered as if made to this one. */
const PUBLIC_ORIGIN = new URL(process.env['PUBLIC_ORIGIN'] || 'https://lingerie.scrov.app');
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', PUBLIC_ORIGIN.hostname]);

const angularApp = new AngularAppEngine({ allowedHosts: [...ALLOWED_HOSTS] });

async function handle(request: Request): Promise<Response | null> {
	const url = new URL(request.url);
	if (url.pathname === '/healthz') {
		return new Response('ok', { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
	}
	const moved = legacyRedirect(url);
	if (moved) return moved;
	if (url.pathname.startsWith('/cms/')) return proxyCms(request, url);
	if (url.pathname === '/rss.xml') return feeds(rss, url);
	if (url.pathname === '/sitemap.xml') return feeds(sitemap, url);
	return angularApp.handle(request, SSR_CONTEXT);
}

/**
 * Browsers read CMS content from /cms/api/… on this site. In production the front Worker answers these before the
 * container; this covers `ng serve`, CI and any other setup without that Worker.
 */
async function proxyCms(request: Request, url: URL): Promise<Response> {
	if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Méthode non permise', { status: 405 });
	if (url.pathname.startsWith('/cms/api/admin')) return new Response('Introuvable', { status: 404 });
	const upstream = await fetch(CMS_ORIGIN + url.pathname + url.search, {
		method: request.method,
		headers: { Accept: request.headers.get('accept') ?? '*/*' },
		signal: AbortSignal.timeout(10_000),
	});
	const headers = new Headers();
	for (const name of ['content-type', 'cache-control', 'etag', 'last-modified']) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	return new Response(upstream.body, { status: upstream.status, headers });
}

// ---------- Node adapter ----------

function firstHeader(req: IncomingMessage, name: string): string | undefined {
	const value = req.headers[name];
	return (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined;
}

/**
 * The container has no public ingress: every request comes through the front Worker, which sets
 * X-Forwarded-Host/Proto itself (overwriting anything the visitor sent). Unknown hosts fall back to
 * PUBLIC_ORIGIN so absolute URLs (redirects, sitemap, og:image) always use the real domain.
 */
function toWebRequest(req: IncomingMessage): Request {
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) for (const v of value) headers.append(name, v);
		else headers.set(name, value);
	}
	const host = (firstHeader(req, 'x-forwarded-host') ?? firstHeader(req, 'host') ?? '').toLowerCase();
	const hostname = host.replace(/:\d+$/, '');
	let origin = PUBLIC_ORIGIN;
	if (ALLOWED_HOSTS.has(hostname)) {
		const proto = firstHeader(req, 'x-forwarded-proto') === 'https' ? 'https' : 'http';
		origin = new URL(`${proto}://${host}`);
	}
	// The forwarded values are now in the URL. Make Host agree with it (the Worker connects as "container"),
	// so Angular's allowed-hosts check sees the public host and not the internal one.
	headers.set('host', origin.host);
	headers.delete('x-forwarded-host');
	headers.delete('x-forwarded-proto');
	const method = req.method ?? 'GET';
	const hasBody = method !== 'GET' && method !== 'HEAD';
	return new Request(new URL(req.url ?? '/', origin), {
		method,
		headers,
		body: hasBody ? (Readable.toWeb(req) as unknown as BodyInit) : undefined,
		duplex: hasBody ? 'half' : undefined,
	} as RequestInit);
}

async function nodeHandler(req: IncomingMessage, res: ServerResponse, next?: (error?: unknown) => void): Promise<void> {
	try {
		const response = await handle(toWebRequest(req));
		if (response) {
			await writeResponseToNodeResponse(response, res);
		} else if (next) {
			next();
		} else {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Page introuvable.');
		}
	} catch (error) {
		if (next) {
			next(error);
			return;
		}
		console.error(JSON.stringify({ msg: 'ssr_error', path: req.url, error: error instanceof Error ? error.stack : String(error) }));
		if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Une erreur est survenue.');
	}
}

/** Used by the Angular CLI dev server (`ng serve`). */
export const reqHandler = createNodeRequestHandler(nodeHandler);

if (isMainModule(import.meta.url)) {
	const port = Number(process.env['PORT'] || 8080);
	const server = createServer((req, res) => void nodeHandler(req, res));
	server.keepAliveTimeout = 65_000;
	server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ msg: 'listening', port, origin: PUBLIC_ORIGIN.origin })));
	// Rollouts send SIGTERM: finish in-flight requests, then exit.
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => {
			server.close(() => process.exit(0));
			setTimeout(() => process.exit(0), 10_000).unref();
		});
	}
}

// ---------- Old site URLs ----------

/** Maps the old MaPlateforme addresses (index.html, blog.html, …/index.html, trailing slashes) to the new routes. */
function legacyRedirect(url: URL): Response | null {
	const p = url.pathname;
	const to = (path: string) => Response.redirect(new URL(path, url.origin).toString(), 301);
	if (p === '/index.html' || p === '/index.php') return to('/');
	if (p === '/blog.html' || p.startsWith('/blog-recherche.php')) return to('/blog');
	const categoryIndex = /^\/blog\/categorie\/([^/]+)\/index\.html$/.exec(p);
	if (categoryIndex) return to(`/blog/categorie/${categoryIndex[1]}`);
	const index = /^\/(blog|page)\/([^/]+)\/index\.html$/.exec(p);
	if (index) return to(`/${index[1]}/${index[2]}`);
	if (p.length > 1 && p.endsWith('/') && !p.startsWith('/uploads/')) return to(p.replace(/\/+$/, '') + url.search);
	return null;
}

// ---------- RSS and sitemap, generated from the CMS ----------

interface PostSummary {
	slug: string;
	title: string;
	excerpt: string;
	published_at: string;
}
interface PageSummary {
	slug: string;
}

const xmlEscape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function cms<T>(path: string): Promise<T> {
	const res = await fetch(CMS_ORIGIN + path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error(`CMS ${path} responded ${res.status}`);
	return (await res.json()) as T;
}

async function allPosts(limit = 1000): Promise<PostSummary[]> {
	const out: PostSummary[] = [];
	let cursor: string | null = null;
	do {
		const page: { data: PostSummary[]; next_cursor: string | null } = await cms(
			`/api/posts?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
		);
		out.push(...page.data);
		cursor = page.next_cursor;
	} while (cursor && out.length < limit);
	return out;
}

async function rss(origin: string): Promise<string> {
	const [posts, settings] = await Promise.all([allPosts(50), cms<{ tagline?: string }>('/api/settings')]);
	const items = posts
		.map(
			(p) => `
  <item>
    <title>${xmlEscape(p.title)}</title>
    <link>${origin}/blog/${p.slug}</link>
    <guid isPermaLink="true">${origin}/blog/${p.slug}</guid>
    <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
    <description>${xmlEscape(p.excerpt)}</description>
  </item>`,
		)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xmlEscape(SITE_NAME)}</title>
  <link>${origin}/blog</link>
  <description>${xmlEscape(settings.tagline || 'Blogue')}</description>
  <language>fr-CA</language>${items}
</channel>
</rss>
`;
}

async function sitemap(origin: string): Promise<string> {
	const [posts, pages] = await Promise.all([allPosts(), cms<{ data: PageSummary[] }>('/api/pages')]);
	const urls = [
		{ loc: `${origin}/` },
		{ loc: `${origin}/blog` },
		{ loc: `${origin}/contact` },
		...pages.data.map((p) => ({ loc: `${origin}/page/${p.slug}` })),
		...posts.map((p) => ({ loc: `${origin}/blog/${p.slug}`, lastmod: p.published_at.slice(0, 10) })),
	];
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${'lastmod' in u && u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

async function feeds(build: (origin: string) => Promise<string>, url: URL): Promise<Response> {
	try {
		return new Response(await build(url.origin), {
			headers: {
				'Content-Type': 'application/xml; charset=utf-8',
				'Cache-Control': 'public, max-age=900',
			},
		});
	} catch (err) {
		console.error(JSON.stringify({ msg: 'feed_failed', path: url.pathname, error: String(err) }));
		return new Response('Flux temporairement indisponible.', { status: 503, headers: { 'Retry-After': '300' } });
	}
}
