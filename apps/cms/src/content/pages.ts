import { deleteRow, insertRow, updateRow } from '../db';
import { badRequest, notFound } from '../http';
import { has, idParam, int, oneOf, onlyKeys, slug, slugify, str, textExcerpt, url } from '../validate';

const STATUSES = ['draft', 'published'] as const;

interface PageRow {
  id: number;
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  hero_image: string;
  seo_description: string;
  nav_section: string;
  nav_label: string;
  position: number;
  status: (typeof STATUSES)[number];
  created_at: string;
  updated_at: string;
}

export async function getPublishedPage(db: D1Database, slugParam: string) {
  const row = await db.prepare(`SELECT * FROM pages WHERE slug = ? AND status = 'published'`).bind(slugParam).first<PageRow>();
  if (!row) throw notFound('Page');
  return {
    slug: row.slug,
    title: row.title,
    body: row.body,
    excerpt: row.excerpt || textExcerpt(row.body),
    hero_image: row.hero_image,
    seo_description: row.seo_description || row.excerpt || textExcerpt(row.body, 160),
    nav_section: row.nav_section,
    updated_at: row.updated_at,
  };
}

/** Published pages without bodies, for the menu, footer and section listings. */
export async function listPublishedPages(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT slug, title, nav_section, nav_label, position, hero_image, excerpt, body
       FROM pages WHERE status = 'published' ORDER BY nav_section, position, title`,
    )
    .all<PageRow>();
  return results.map((r) => ({
    slug: r.slug,
    title: r.title,
    nav_section: r.nav_section,
    nav_label: r.nav_label || r.title,
    position: r.position,
    hero_image: r.hero_image,
    excerpt: r.excerpt || textExcerpt(r.body),
  }));
}

export async function listAdminPages(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT id, slug, title, nav_section, nav_label, position, hero_image, status, created_at, updated_at
       FROM pages ORDER BY nav_section, position, title`,
    )
    .all();
  return results;
}

export async function getAdminPage(db: D1Database, rawId: string | undefined) {
  const row = await db.prepare('SELECT * FROM pages WHERE id = ?').bind(idParam(rawId)).first<PageRow>();
  if (!row) throw notFound('Page');
  return row;
}

const FIELDS = ['slug', 'title', 'body', 'excerpt', 'hero_image', 'seo_description', 'nav_section', 'nav_label', 'position', 'status'] as const;

function parsePage(body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  onlyKeys(body, FIELDS);
  const out: Record<string, unknown> = {};
  if (!partial || has(body, 'title')) out.title = str(body, 'title', { min: 1, max: 200 });
  if (has(body, 'slug')) out.slug = slug(body);
  else if (!partial) {
    out.slug = slugify(out.title as string);
    if (!out.slug) throw badRequest('slug : impossible de le déduire du titre, indiquez-en un', { field: 'slug' });
  }
  if (has(body, 'body')) out.body = str(body, 'body', { max: 200_000, trim: false });
  if (has(body, 'excerpt')) out.excerpt = str(body, 'excerpt', { max: 500 });
  if (has(body, 'hero_image')) out.hero_image = url(body, 'hero_image');
  if (has(body, 'seo_description')) out.seo_description = str(body, 'seo_description', { max: 300 });
  if (has(body, 'nav_section')) out.nav_section = slugOrEmpty(body, 'nav_section');
  if (has(body, 'nav_label')) out.nav_label = str(body, 'nav_label', { max: 100 });
  if (has(body, 'position')) out.position = int(body, 'position', { min: -1_000_000, max: 1_000_000 });
  if (has(body, 'status')) out.status = oneOf(body, 'status', STATUSES);
  return out;
}

/** Menu section key, e.g. "produits". Empty = not in the menu. */
function slugOrEmpty(body: Record<string, unknown>, key: string): string {
  const s = str(body, key, { max: 60 });
  return s === '' ? '' : slug({ [key]: s }, key, 60);
}

export async function createPage(db: D1Database, body: Record<string, unknown>) {
  const id = await insertRow(db, 'pages', parsePage(body, false));
  return getAdminPage(db, String(id));
}

export async function updatePage(db: D1Database, rawId: string | undefined, body: Record<string, unknown>) {
  const id = idParam(rawId);
  await updateRow(db, 'pages', id, parsePage(body, true), 'Page');
  return getAdminPage(db, String(id));
}

export async function deletePage(db: D1Database, rawId: string | undefined) {
  await deleteRow(db, 'pages', idParam(rawId), 'Page');
}
