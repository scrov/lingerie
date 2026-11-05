import { badRequest, mapDbError } from '../http';

const KEY_RE = /^[a-z][a-z0-9_]{0,99}$/;

export async function getSettings(db: D1Database): Promise<Record<string, unknown>> {
  const { results } = await db.prepare('SELECT key, value FROM settings ORDER BY key').all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)]));
}

/** Upserts every key in the body. Values can be any JSON; null clears a value but keeps the key. */
export async function putSettings(db: D1Database, body: Record<string, unknown>) {
  const entries = Object.entries(body);
  if (!entries.length) throw badRequest('Rien à mettre à jour');
  if (entries.length > 50) throw badRequest('50 réglages au plus par requête');
  for (const [key, value] of entries) {
    if (!KEY_RE.test(key)) throw badRequest(`${key} : lettres minuscules, chiffres et _ seulement`, { field: key });
    if (JSON.stringify(value ?? null).length > 50_000) throw badRequest(`${key} : valeur trop longue`, { field: key });
  }
  try {
    await db.batch(
      entries.map(([key, value]) =>
        db
          .prepare(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
          )
          .bind(key, JSON.stringify(value ?? null)),
      ),
    );
  } catch (err) {
    mapDbError(err);
  }
  return getSettings(db);
}
