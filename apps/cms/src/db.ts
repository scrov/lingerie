import { badRequest, mapDbError, notFound } from './http';

export const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** Column names passed here must come from a parser's fixed whitelist, never from user input. */
export async function insertRow(db: D1Database, table: string, data: Record<string, unknown>): Promise<number> {
  const cols = Object.keys(data);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`;
  try {
    const row = await db.prepare(sql).bind(...cols.map((c) => data[c])).first<{ id: number }>();
    return row!.id;
  } catch (err) {
    mapDbError(err);
  }
}

export async function updateRow(
  db: D1Database,
  table: string,
  id: number,
  data: Record<string, unknown>,
  what: string,
): Promise<void> {
  const cols = Object.keys(data);
  if (!cols.length) throw badRequest('Rien à mettre à jour');
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ${NOW_SQL} WHERE id = ? RETURNING id`;
  let row: { id: number } | null;
  try {
    row = await db.prepare(sql).bind(...cols.map((c) => data[c]), id).first<{ id: number }>();
  } catch (err) {
    mapDbError(err);
  }
  if (!row) throw notFound(what);
}

export async function deleteRow(db: D1Database, table: string, id: number, what: string): Promise<void> {
  const row = await db.prepare(`DELETE FROM ${table} WHERE id = ? RETURNING id`).bind(id).first();
  if (!row) throw notFound(what);
}

export function mediaUrl(origin: string, key: string): string {
  return `${origin}/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export function parseLimit(raw: string | null, fallback: number, max: number): number {
  if (raw === null) return fallback;
  if (!/^\d{1,4}$/.test(raw)) throw badRequest('limit doit être un nombre');
  const n = Number(raw);
  if (n < 1 || n > max) throw badRequest(`limit doit être entre 1 et ${max}`);
  return n;
}
