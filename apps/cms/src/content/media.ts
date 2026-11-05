import type { Env } from '../env';
import { mediaUrl } from '../db';
import { HttpError, badRequest, notFound } from '../http';
import { onlyKeys, str } from '../validate';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};
const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,299}$/;

interface MediaRow {
  key: string;
  filename: string;
  content_type: string;
  size: number;
  alt: string;
  created_at: string;
}

function shape(row: MediaRow, origin: string) {
  return { ...row, url: mediaUrl(origin, row.key) };
}

export function validKey(key: string): string {
  if (!KEY_RE.test(key) || key.includes('..') || key.includes('//')) throw notFound('Image');
  return key;
}

export async function listMedia(env: Env, origin: string) {
  const { results } = await env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC, key LIMIT 500').all<MediaRow>();
  return results.map((r) => shape(r, origin));
}

/**
 * Upload body is the raw file. Headers: Content-Type (image/*), X-Filename, optional X-Alt
 * (both URI-encoded). Writes R2 first; if the database insert fails the object is removed again.
 */
export async function uploadMedia(req: Request, env: Env, origin: string) {
  const type = (req.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) {
    throw new HttpError(415, 'unsupported_media_type', `Formats acceptés : JPEG, PNG, WebP, AVIF ou GIF (reçu « ${type || 'aucun'} »)`);
  }
  const tooBig = () => new HttpError(413, 'payload_too_large', 'Les images doivent faire 10 Mo ou moins');
  if (Number(req.headers.get('Content-Length') ?? '0') > MAX_UPLOAD_BYTES) throw tooBig();
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) throw badRequest('Le fichier est vide');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw tooBig();

  const decode = (h: string | null) => {
    try {
      return h ? decodeURIComponent(h) : '';
    } catch {
      return h ?? '';
    }
  };
  const filename = decode(req.headers.get('X-Filename')).slice(0, 255) || `image.${ext}`;
  const alt = decode(req.headers.get('X-Alt')).trim().slice(0, 300);

  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;

  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { filename },
  });
  try {
    await env.DB.prepare('INSERT INTO media (key, filename, content_type, size, alt) VALUES (?, ?, ?, ?, ?)')
      .bind(key, filename, type, bytes.byteLength, alt)
      .run();
  } catch (err) {
    await env.MEDIA.delete(key).catch((cleanupErr: unknown) =>
      console.error(JSON.stringify({ msg: 'orphaned_r2_object', key, error: String(cleanupErr) })),
    );
    throw err;
  }
  const row = await env.DB.prepare('SELECT * FROM media WHERE key = ?').bind(key).first<MediaRow>();
  return shape(row!, origin);
}

export async function updateMedia(env: Env, rawKey: string, body: Record<string, unknown>, origin: string) {
  const key = validKey(rawKey);
  onlyKeys(body, ['alt']);
  const alt = str(body, 'alt', { max: 300 });
  const row = await env.DB.prepare('UPDATE media SET alt = ? WHERE key = ? RETURNING *').bind(alt, key).first<MediaRow>();
  if (!row) throw notFound('Image');
  return shape(row, origin);
}

/** Removes the row first, then the R2 object. Pages or posts still pointing at the URL will show a broken image. */
export async function deleteMedia(env: Env, rawKey: string) {
  const key = validKey(rawKey);
  const row = await env.DB.prepare('DELETE FROM media WHERE key = ? RETURNING key').bind(key).first();
  if (!row) throw notFound('Image');
  try {
    await env.MEDIA.delete(key);
  } catch (err) {
    console.error(JSON.stringify({ msg: 'orphaned_r2_object', key, error: String(err) }));
  }
}

export async function serveMedia(req: Request, env: Env, rawKey: string): Promise<Response> {
  const key = validKey(rawKey);
  const obj = await env.MEDIA.get(key, { onlyIf: req.headers });
  if (!obj) throw notFound('Image');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Access-Control-Allow-Origin', '*');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  headers.set('Content-Length', String(obj.size));
  return new Response(req.method === 'HEAD' ? null : obj.body, { headers });
}
