import { AngularAppEngine, createRequestHandler } from '@angular/ssr';

/** Must match CMS_URL in src/app/cms/cms.ts. */
const CMS_URL = 'https://lingerie-cms.scrov.app';
const SITE_NAME = 'Lingerie & Maillots Christine';

const angularApp = new AngularAppEngine({
	// It is safe to set allow `localhost`, so that SSR can run in local development,
	// as, in production, Cloudflare will ensure that `localhost` is not the host.
	allowedHosts: ['localhost'],
});

/**
 * This is a request handler used by the Angular CLI (dev-server and during build).
 */
export const reqHandler = createRequestHandler(async (req) => {
	const url = new URL(req.url);

	const moved = legacyRedirect(url);
	if (moved) return moved;
	if (url.pathname === '/rss.xml') return feeds(rss, url);
	if (url.pathname === '/sitemap.xml') return feeds(sitemap, url);

	const res = await angularApp.handle(req);

	return res ?? new Response('Page introuvable.', { status: 404 });
});

export default { fetch: reqHandler };

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
	const res = await fetch(CMS_URL + path, { headers: { Accept: 'application/json' } });
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
