import { deleteRow, insertRow, parseLimit, updateRow, type Page } from '../db';
import { badRequest, notFound } from '../http';
import { has, idParam, isoDate, oneOf, onlyKeys, slug, slugify, str, textExcerpt, url } from '../validate';

const STATUSES = ['draft', 'published'] as const;

interface PostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_image: string;
  category: string;
  category_slug: string;
  seo_description: string;
  status: (typeof STATUSES)[number];
  published_at: string;
  created_at: string;
  updated_at: string;
}

/** Published and not scheduled for later. */
const VISIBLE = `status = 'published' AND published_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

// Listings only need the start of the body, to derive an excerpt when none was written.
const SUMMARY_COLUMNS = `id, slug, title, excerpt, cover_image, category, category_slug, published_at,
  CASE WHEN excerpt = '' THEN substr(body, 1, 3000) ELSE '' END AS body`;

function summary(r: Pick<PostRow, 'slug' | 'title' | 'excerpt' | 'body' | 'cover_image' | 'category' | 'category_slug' | 'published_at'>) {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt || textExcerpt(r.body),
    cover_image: r.cover_image,
    category: r.category,
    category_slug: r.category_slug,
    published_at: r.published_at,
  };
}

const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_(\d{1,15})$/;

export async function listPublishedPosts(db: D1Database, u: URL): Promise<Page<ReturnType<typeof summary>>> {
  const q = u.searchParams;
  const limit = parseLimit(q.get('limit'), 12, 50);
  const where = [VISIBLE];
  const args: unknown[] = [];
  const category = q.get('category');
  if (category) {
    where.push('category_slug = ?');
    args.push(category);
  }
  const rawCursor = q.get('cursor');
  if (rawCursor) {
    const m = CURSOR_RE.exec(rawCursor);
    if (!m) throw badRequest('cursor invalide');
    where.push('(published_at < ? OR (published_at = ? AND id < ?))');
    args.push(m[1], m[1], Number(m[2]));
  }
  const { results } = await db
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM posts WHERE ${where.join(' AND ')} ORDER BY published_at DESC, id DESC LIMIT ?`)
    .bind(...args, limit + 1)
    .all<PostRow>();
  const hasMore = results.length > limit;
  const rows = hasMore ? results.slice(0, limit) : results;
  const last = rows[rows.length - 1];
  return { data: rows.map(summary), next_cursor: hasMore && last ? `${last.published_at}_${last.id}` : null };
}

export async function listPostCategories(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT category AS name, category_slug AS slug, count(*) AS post_count
       FROM posts WHERE ${VISIBLE} AND category_slug != ''
       GROUP BY category_slug ORDER BY name`,
    )
    .all();
  return results;
}

export async function getPublishedPost(db: D1Database, slugParam: string) {
  const row = await db.prepare(`SELECT * FROM posts WHERE slug = ? AND ${VISIBLE}`).bind(slugParam).first<PostRow>();
  if (!row) throw notFound('Article');
  const [newer, older] = await Promise.all([
    db
      .prepare(`SELECT ${SUMMARY_COLUMNS} FROM posts WHERE ${VISIBLE} AND (published_at > ? OR (published_at = ? AND id > ?)) ORDER BY published_at ASC, id ASC LIMIT 1`)
      .bind(row.published_at, row.published_at, row.id)
      .first<PostRow>(),
    db
      .prepare(`SELECT ${SUMMARY_COLUMNS} FROM posts WHERE ${VISIBLE} AND (published_at < ? OR (published_at = ? AND id < ?)) ORDER BY published_at DESC, id DESC LIMIT 1`)
      .bind(row.published_at, row.published_at, row.id)
      .first<PostRow>(),
  ]);
  return {
    ...summary(row),
    body: row.body,
    seo_description: row.seo_description || row.excerpt || textExcerpt(row.body, 160),
    updated_at: row.updated_at,
    newer: newer ? summary(newer) : null,
    older: older ? summary(older) : null,
  };
}

export async function listAdminPosts(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT id, slug, title, cover_image, category, status, published_at, updated_at,
         (status = 'published' AND published_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS scheduled
       FROM posts ORDER BY published_at DESC, id DESC LIMIT 1000`,
    )
    .all();
  return results;
}

export async function getAdminPost(db: D1Database, rawId: string | undefined) {
  const row = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(idParam(rawId)).first<PostRow>();
  if (!row) throw notFound('Article');
  return row;
}

const FIELDS = [
  'slug', 'title', 'excerpt', 'body', 'cover_image', 'category', 'category_slug', 'seo_description', 'status', 'published_at',
] as const;

function parsePost(body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  onlyKeys(body, FIELDS);
  const out: Record<string, unknown> = {};
  if (!partial || has(body, 'title')) out.title = str(body, 'title', { min: 1, max: 200 });
  if (has(body, 'slug')) out.slug = slug(body, 'slug', 160);
  else if (!partial) {
    out.slug = slugify(out.title as string, 160);
    if (!out.slug) throw badRequest('slug : impossible de le déduire du titre, indiquez-en un', { field: 'slug' });
  }
  if (has(body, 'excerpt')) out.excerpt = str(body, 'excerpt', { max: 500 });
  if (has(body, 'body')) out.body = str(body, 'body', { max: 200_000, trim: false });
  if (has(body, 'cover_image')) out.cover_image = url(body, 'cover_image');
  if (has(body, 'category')) out.category = str(body, 'category', { max: 100 });
  if (has(body, 'category_slug')) {
    const s = str(body, 'category_slug', { max: 120 });
    out.category_slug = s === '' ? '' : slug(body, 'category_slug');
  } else if (has(body, 'category')) {
    out.category_slug = slugify(out.category as string);
  }
  if (has(body, 'seo_description')) out.seo_description = str(body, 'seo_description', { max: 300 });
  if (has(body, 'status')) out.status = oneOf(body, 'status', STATUSES);
  if (has(body, 'published_at')) out.published_at = isoDate(body, 'published_at');
  return out;
}

export async function createPost(db: D1Database, body: Record<string, unknown>) {
  const id = await insertRow(db, 'posts', parsePost(body, false));
  return getAdminPost(db, String(id));
}

export async function updatePost(db: D1Database, rawId: string | undefined, body: Record<string, unknown>) {
  const id = idParam(rawId);
  await updateRow(db, 'posts', id, parsePost(body, true), 'Article');
  return getAdminPost(db, String(id));
}

export async function deletePost(db: D1Database, rawId: string | undefined) {
  await deleteRow(db, 'posts', idParam(rawId), 'Article');
}
