import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import worker from '../src/index';
import type { Env } from '../src/env';
import { ADMIN_TOKEN, makeEnv } from './fakes';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const ORIGIN = 'https://lingerie-cms.scrov.app';

let env: Env;
let ctx: ReturnType<typeof makeEnv>;

beforeEach(() => {
  ctx = makeEnv(MIGRATIONS);
  env = ctx.env;
});

async function call(method: string, path: string, opts: { body?: unknown; token?: string | null; headers?: Record<string, string> } = {}) {
  const headers = new Headers(opts.headers);
  const token = opts.token === undefined ? (path.startsWith('/api/admin') ? ADMIN_TOKEN : null) : opts.token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body: BodyInit | undefined;
  if (opts.body instanceof Uint8Array) body = opts.body;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }
  const res = await worker.fetch(new Request(ORIGIN + path, { method, headers, body }), env);
  const text = res.status === 204 || res.status === 304 || method === 'HEAD' ? '' : await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const createPost = (body: Record<string, unknown>) => call('POST', '/api/admin/posts', { body });
const createPage = (body: Record<string, unknown>) => call('POST', '/api/admin/pages', { body });

describe('public API', () => {
  test('health check queries the database', async () => {
    const { res, json } = await call('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(json, { ok: true });
  });

  test('also answers under the /cms prefix used by the storefront', async () => {
    const plain = await call('GET', '/api/settings');
    const prefixed = await call('GET', '/cms/api/settings');
    assert.equal(prefixed.res.status, 200);
    assert.deepEqual(prefixed.json, plain.json);
    assert.equal((await call('GET', '/cms/api/nope')).res.status, 404);
  });

  test('business settings from the migration', async () => {
    const s = await call('GET', '/api/settings');
    assert.equal(s.json.site_name, 'Lingerie & Maillots Christine');
    assert.equal(s.json.phone, '450-304-3555');
    assert.equal(s.json.hours.length, 6);
    assert.equal(s.res.headers.get('Access-Control-Allow-Origin'), '*');
  });

  test('preflight, wrong method, unknown endpoint', async () => {
    const pre = await call('OPTIONS', '/api/posts');
    assert.equal(pre.res.status, 204);
    const post = await call('POST', '/api/posts', { body: {} });
    assert.equal(post.res.status, 405);
    assert.equal((await call('GET', '/api/nope')).res.status, 404);
    assert.equal((await call('GET', '/api/posts/Not_A_Slug')).res.status, 404);
  });

  test('root redirects to the admin UI, other paths go to static assets', async () => {
    const root = await worker.fetch(new Request(ORIGIN + '/'), env);
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('Location'), ORIGIN + '/admin/');
    const asset = await worker.fetch(new Request(ORIGIN + '/admin/admin.js'), env);
    assert.equal(await asset.text(), 'asset');
  });
});

describe('admin auth', () => {
  test('rejects missing and wrong tokens, without CORS headers', async () => {
    const none = await call('GET', '/api/admin/posts', { token: null });
    assert.equal(none.res.status, 401);
    assert.equal(none.res.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal((await call('GET', '/api/admin/posts', { token: 'x'.repeat(32) })).res.status, 401);
    assert.equal((await call('GET', '/api/admin/me')).res.status, 200);
  });

  test('is disabled until ADMIN_TOKEN is set', async () => {
    env = makeEnv(MIGRATIONS, { ADMIN_TOKEN: undefined }).env;
    const r = await call('GET', '/api/admin/me', { token: 'anything-long-enough-0123456789' });
    assert.equal(r.res.status, 503);
    assert.equal(r.json.error.code, 'admin_disabled');
  });
});

describe('pages', () => {
  test('publish flow, menu listing and legacy slugs', async () => {
    const created = await createPage({
      title: 'Sous-vêtements et maillots pour hommes',
      slug: '-sous-vetements-et-maillots-de-bain-pour-hommes-saxx',
      nav_section: 'produits',
      nav_label: 'Hommes',
      position: 6,
      hero_image: '/uploads/site/hommes.jpg',
      body: '<p>Marque <strong>Saxx</strong>.</p>\n<p>Deuxième paragraphe.</p>',
    });
    assert.equal(created.res.status, 201, JSON.stringify(created.json));
    assert.equal(created.json.status, 'draft');
    const path = '/api/pages/-sous-vetements-et-maillots-de-bain-pour-hommes-saxx';
    assert.equal((await call('GET', path)).res.status, 404, 'drafts are hidden');

    await call('PUT', `/api/admin/pages/${created.json.id}`, { body: { status: 'published' } });
    const page = await call('GET', path);
    assert.equal(page.res.status, 200);
    assert.equal(page.json.excerpt, 'Marque Saxx. Deuxième paragraphe.');
    assert.equal(page.json.hero_image, '/uploads/site/hommes.jpg');

    const list = await call('GET', '/api/pages');
    assert.deepEqual(list.json.data.map((p: any) => [p.nav_section, p.nav_label, p.position]), [['produits', 'Hommes', 6]]);
    assert.equal('body' in list.json.data[0], false);
  });

  test('validation', async () => {
    const r1 = await createPage({ title: 'X', hero_image: 'javascript:alert(1)' });
    assert.equal(r1.res.status, 400);
    assert.equal(r1.json.error.details.field, 'hero_image');
    const r2 = await createPage({ title: 'X', nav_section: 'Produits Femmes' });
    assert.equal(r2.res.status, 400);
    const r3 = await createPage({ title: 'X', colour: 'red' });
    assert.equal(r3.res.status, 400);
    assert.match(r3.json.error.message, /colour/);
    await createPage({ title: 'Notre équipe' });
    const dup = await createPage({ title: 'Notre équipe' });
    assert.equal(dup.res.status, 409);
    assert.equal(dup.json.error.details.field, 'slug');
    const notJson = await call('POST', '/api/admin/pages', { body: { title: 'x' }, headers: { 'Content-Type': 'text/plain' } });
    assert.equal(notJson.res.status, 415);
    assert.equal((await call('PUT', '/api/admin/pages/999', { body: { title: 'x' } })).res.status, 404);
    assert.equal((await call('PUT', '/api/admin/pages/1', { body: {} })).res.status, 400);
  });
});

describe('posts', () => {
  test('drafts and scheduled posts stay hidden', async () => {
    const draft = await createPost({ title: 'Brouillon', body: '<p>x</p>' });
    assert.equal(draft.json.slug, 'brouillon');
    await createPost({ title: 'Plus tard', status: 'published', published_at: '2999-01-01' });
    await createPost({ title: 'Visible', status: 'published', published_at: '2026-02-06T08:43:52Z', body: '<p>Bonjour&nbsp;à toutes</p>' });

    const list = await call('GET', '/api/posts');
    assert.deepEqual(list.json.data.map((p: any) => p.slug), ['visible']);
    assert.equal(list.json.data[0].excerpt, 'Bonjour à toutes');
    assert.equal(list.json.data[0].published_at, '2026-02-06T08:43:52.000Z');
    assert.equal((await call('GET', '/api/posts/plus-tard')).res.status, 404);

    const admin = await call('GET', '/api/admin/posts');
    assert.equal(admin.json.data.length, 3);
    assert.equal(admin.json.data.find((p: any) => p.slug === 'plus-tard').scheduled, 1);
  });

  test('feed pagination, categories and neighbours', async () => {
    const dates = ['2022-07-07', '2023-07-03', '2024-01-25', '2025-03-14', '2026-02-06'];
    for (const [i, d] of dates.entries()) {
      await createPost({
        title: `Article ${i + 1}`,
        status: 'published',
        published_at: d,
        category: i % 2 ? 'Conseils' : 'Actualités',
        ...(i % 2 ? {} : { category_slug: 'actualites-' }),
      });
    }
    const p1 = await call('GET', '/api/posts?limit=2');
    assert.deepEqual(p1.json.data.map((p: any) => p.slug), ['article-5', 'article-4']);
    const p2 = await call('GET', `/api/posts?limit=2&cursor=${encodeURIComponent(p1.json.next_cursor)}`);
    assert.deepEqual(p2.json.data.map((p: any) => p.slug), ['article-3', 'article-2']);
    const p3 = await call('GET', `/api/posts?limit=2&cursor=${encodeURIComponent(p2.json.next_cursor)}`);
    assert.deepEqual(p3.json.data.map((p: any) => p.slug), ['article-1']);
    assert.equal(p3.json.next_cursor, null);
    assert.equal((await call('GET', '/api/posts?cursor=nope')).res.status, 400);

    const news = await call('GET', '/api/posts?category=actualites-');
    assert.deepEqual(news.json.data.map((p: any) => p.slug), ['article-5', 'article-3', 'article-1']);
    const cats = await call('GET', '/api/post-categories');
    assert.deepEqual(cats.json.data, [
      { name: 'Actualités', slug: 'actualites-', post_count: 3 },
      { name: 'Conseils', slug: 'conseils', post_count: 2 },
    ]);

    const mid = await call('GET', '/api/posts/article-3');
    assert.equal(mid.json.newer.slug, 'article-4');
    assert.equal(mid.json.older.slug, 'article-2');
    assert.equal('body' in mid.json.newer, false);
  });

  test('validation', async () => {
    const date = await createPost({ title: 'X', published_at: '06/02/2026' });
    assert.equal(date.res.status, 400);
    assert.equal(date.json.error.details.field, 'published_at');
    const status = await createPost({ title: 'X', status: 'live' });
    assert.equal(status.res.status, 400);
    const cover = await createPost({ title: 'X', cover_image: 'http://insecure.example/x.png' });
    assert.equal(cover.res.status, 400);
  });
});

describe('media', () => {
  test('upload, serve with caching, update alt, delete', async () => {
    const up = await call('POST', '/api/admin/media', {
      body: PNG,
      headers: { 'Content-Type': 'image/png', 'X-Filename': encodeURIComponent('soutien-gorge.png'), 'X-Alt': encodeURIComponent('Vue de face') },
    });
    assert.equal(up.res.status, 201);
    assert.match(up.json.key, /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    assert.equal(up.json.alt, 'Vue de face');

    const served = await worker.fetch(new Request(up.json.url), env);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('Content-Type'), 'image/png');
    assert.deepEqual(new Uint8Array(await served.arrayBuffer()), PNG);
    const cached = await worker.fetch(new Request(up.json.url, { headers: { 'If-None-Match': served.headers.get('ETag')! } }), env);
    assert.equal(cached.status, 304);

    assert.equal((await call('PUT', `/api/admin/media/${up.json.key}`, { body: { alt: 'Vue de côté' } })).json.alt, 'Vue de côté');
    assert.equal((await call('GET', '/api/admin/media')).json.data.length, 1);
    assert.equal((await call('DELETE', `/api/admin/media/${up.json.key}`)).res.status, 204);
    assert.equal(ctx.MEDIA.objects.size, 0);
    assert.equal((await worker.fetch(new Request(up.json.url), env)).status, 404);
  });

  test('rejects non-images and path tricks', async () => {
    const txt = await call('POST', '/api/admin/media', { body: PNG, headers: { 'Content-Type': 'text/plain' } });
    assert.equal(txt.res.status, 415);
    assert.equal(ctx.MEDIA.objects.size, 0);
    assert.equal((await call('GET', '/media/..%2F..%2Fsecret')).res.status, 404);
    assert.equal((await call('GET', '/media/')).res.status, 404);
  });
});

describe('settings', () => {
  test('upsert any JSON, reject bad keys', async () => {
    const put = await call('PUT', '/api/admin/settings', { body: { announcement: 'Soldes de janvier', facebook_url: 'https://facebook.com/x' } });
    assert.equal(put.res.status, 200);
    const pub = await call('GET', '/api/settings');
    assert.equal(pub.json.announcement, 'Soldes de janvier');
    assert.equal(pub.json.facebook_url, 'https://facebook.com/x');
    assert.equal((await call('PUT', '/api/admin/settings', { body: { 'Bad Key': 1 } })).res.status, 400);
  });

  test('privacy and tracking defaults from the migration', async () => {
    const { json } = await call('GET', '/api/settings');
    assert.equal(json.consent_enabled, true);
    assert.equal(json.consent_version, 1);
    assert.equal(json.consent_accept_label, 'Tout accepter');
    assert.equal(json.privacy_page, 'politique-de-confidentialite');
    assert.equal(json.terms_page, 'conditions-d-utilisation');
    assert.equal(json.ga4_id, '');
    assert.equal(json.seo_noindex, false);
  });

  test('known keys are validated and normalised', async () => {
    const ok = await call('PUT', '/api/admin/settings', {
      body: { ga4_id: ' g-ab12cd34ef ', google_ads_id: 'aw-123456789', gtm_id: 'gtm-abc1234', meta_pixel_id: '123456789012345', consent_version: 2, seo_noindex: true, privacy_page: 'Politique-De-Confidentialite' },
    });
    assert.equal(ok.res.status, 200);
    assert.equal(ok.json.ga4_id, 'G-AB12CD34EF');
    assert.equal(ok.json.google_ads_id, 'AW-123456789');
    assert.equal(ok.json.gtm_id, 'GTM-ABC1234');
    assert.equal(ok.json.privacy_page, 'politique-de-confidentialite');
    assert.equal(ok.json.seo_noindex, true);

    const bad = async (body: Record<string, unknown>) => {
      const r = await call('PUT', '/api/admin/settings', { body });
      assert.equal(r.res.status, 400, JSON.stringify(body));
      return r.json.error.details.field;
    };
    assert.equal(await bad({ ga4_id: 'UA-12345-1' }), 'ga4_id');
    assert.equal(await bad({ gtm_id: 'GTM-<script>' }), 'gtm_id');
    assert.equal(await bad({ meta_pixel_id: '12ab' }), 'meta_pixel_id');
    assert.equal(await bad({ consent_enabled: 'yes' }), 'consent_enabled');
    assert.equal(await bad({ consent_version: 0 }), 'consent_version');
    assert.equal(await bad({ seo_image: 'javascript:alert(1)' }), 'seo_image');
    assert.equal(await bad({ consent_title: 'x'.repeat(121) }), 'consent_title');
    // A failed batch writes nothing.
    assert.equal((await call('PUT', '/api/admin/settings', { body: { announcement: 'oui', ga4_id: 'nope' } })).res.status, 400);
    assert.notEqual((await call('GET', '/api/settings')).json.announcement, 'oui');

    const cleared = await call('PUT', '/api/admin/settings', { body: { ga4_id: null, consent_title: null } });
    assert.equal(cleared.json.ga4_id, '');
    assert.equal(cleared.json.consent_title, '');
  });

  test('legal pages start as unpublished drafts', async () => {
    const pub = await call('GET', '/api/pages');
    assert.ok(!pub.json.data.some((p: any) => p.nav_section === 'legal'));
    assert.equal((await call('GET', '/api/pages/politique-de-confidentialite')).res.status, 404);
    const admin = await call('GET', '/api/admin/pages');
    const legal = admin.json.data.filter((p: any) => p.nav_section === 'legal');
    assert.deepEqual(legal.map((p: any) => [p.slug, p.status]), [
      ['politique-de-confidentialite', 'draft'],
      ['conditions-d-utilisation', 'draft'],
    ]);
  });
});

describe('errors', () => {
  test('unexpected failures return a generic 500 with a request id', async () => {
    const broken = makeEnv(MIGRATIONS).env as any;
    broken.DB = { prepare() { throw new Error('database exploded'); } };
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (msg: string) => logged.push(msg);
    try {
      const res = await worker.fetch(new Request(ORIGIN + '/api/health', { headers: { 'cf-ray': 'ray-123' } }), broken);
      assert.equal(res.status, 500);
      const body: any = await res.json();
      assert.deepEqual(body.error, { code: 'internal', message: 'Une erreur est survenue', request_id: 'ray-123' });
      assert.ok(logged.some((l) => l.includes('database exploded') && l.includes('ray-123')));
    } finally {
      console.error = originalError;
    }
  });
});
