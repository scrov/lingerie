import { badRequest } from './http';

type Body = Record<string, unknown>;

// Messages are shown as-is in the (French) admin, prefixed with the field name.

/**
 * Lowercase letters, digits and dashes. Leading/trailing/double dashes are allowed so the old site's
 * URLs (e.g. /blog/service-mastectomie-/, /page/-sous-vetements-…) keep working after the move.
 */
export const SLUG_RE = /^(?=[a-z0-9-]*[a-z0-9])[a-z0-9-]{1,160}$/;

function fail(field: string, message: string): never {
  throw badRequest(`${field} : ${message}`, { field });
}

export function has(body: Body, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

export function str(body: Body, key: string, opts: { max: number; min?: number; trim?: boolean }): string {
  const v = body[key];
  if (typeof v !== 'string') fail(key, 'doit être du texte');
  const s = opts.trim === false ? v : v.trim();
  if (s.length < (opts.min ?? 0)) fail(key, opts.min === 1 ? 'est obligatoire' : `au moins ${opts.min} caractères`);
  if (s.length > opts.max) fail(key, `au plus ${opts.max} caractères`);
  return s;
}

export function slug(body: Body, key = 'slug', max = 120): string {
  const s = str(body, key, { min: 1, max }).toLowerCase();
  if (!SLUG_RE.test(s)) fail(key, 'lettres minuscules, chiffres et tirets seulement, p. ex. « soutiens-gorge »');
  return s;
}

export function slugify(input: string, max = 120): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function int(body: Body, key: string, opts: { min?: number; max?: number } = {}): number {
  const v = body[key];
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) fail(key, 'doit être un nombre entier');
  if (opts.min !== undefined && v < opts.min) fail(key, `au moins ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) fail(key, `au plus ${opts.max}`);
  return v;
}

export function oneOf<T extends string>(body: Body, key: string, values: readonly T[]): T {
  const v = body[key];
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) fail(key, `doit valoir ${values.join(' ou ')}`);
  return v as T;
}

/** An image or link URL: empty, root-relative ("/uploads/…") or absolute https. */
export function url(body: Body, key: string): string {
  const s = str(body, key, { max: 500 });
  if (s === '') return s;
  if (/[\s"'<>\\]/.test(s)) fail(key, 'ne doit contenir ni espaces ni guillemets');
  if (!(s.startsWith('https://') || (s.startsWith('/') && !s.startsWith('//')))) {
    fail(key, 'doit commencer par https:// ou /');
  }
  return s;
}

/** ISO-8601 date or date-time, normalised to UTC. A bare date means noon UTC that day. */
export function isoDate(body: Body, key: string): string {
  const s = str(body, key, { min: 1, max: 40 });
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) {
    fail(key, 'date attendue, p. ex. 2026-02-06 ou 2026-02-06T08:43:00Z');
  }
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
  if (Number.isNaN(d.getTime())) fail(key, 'date invalide');
  return d.toISOString();
}

/** Positive integer path parameter. */
export function idParam(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 1) throw badRequest('Identifiant invalide');
  return n;
}

/** Rejects keys the endpoint doesn't know, so typos don't get silently dropped. */
export function onlyKeys(body: Body, allowed: readonly string[]): void {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length) throw badRequest(`Champ inconnu : ${unknown.join(', ')}`, { fields: unknown });
}

/** Plain-text summary of an HTML body, for listings and meta descriptions. */
export function textExcerpt(html: string, max = 200): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // Block-level boundaries become spaces; inline tags (<strong>, <a>…) vanish without one.
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|blockquote|figure|figcaption|img|tr|td|th|table|section|article|hr)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.!?-]+$/, '')}…`;
}
