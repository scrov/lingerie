// Local stand-ins for D1 and R2 so the Worker can be tested with plain Node (22+), no Cloudflare account needed.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Env } from '../src/env';

type Sql = InstanceType<typeof DatabaseSync>;

function d1Error(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`D1_ERROR: ${msg}: SQLITE_CONSTRAINT`);
}

class FakeStatement {
  constructor(
    private readonly db: Sql,
    readonly sql: string,
    readonly args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new FakeStatement(this.db, this.sql, args);
  }
  private stmt() {
    return this.db.prepare(this.sql);
  }
  async first<T>(): Promise<T | null> {
    try {
      return ((this.stmt().get(...(this.args as never[])) as T | undefined) ?? null);
    } catch (e) {
      throw d1Error(e);
    }
  }
  async all<T>() {
    try {
      return { results: this.stmt().all(...(this.args as never[])) as T[], success: true, meta: {} };
    } catch (e) {
      throw d1Error(e);
    }
  }
  async run() {
    try {
      const r = this.stmt().run(...(this.args as never[]));
      return { results: [], success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
    } catch (e) {
      throw d1Error(e);
    }
  }
  runSync() {
    this.stmt().run(...(this.args as never[]));
  }
}

export function fakeD1(migrationsDir: string) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  return {
    raw: db,
    prepare: (sql: string) => new FakeStatement(db, sql),
    async batch(stmts: FakeStatement[]) {
      db.exec('BEGIN');
      try {
        for (const s of stmts) s.runSync();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw d1Error(e);
      }
      return stmts.map(() => ({ results: [], success: true, meta: {} }));
    },
  };
}

interface Stored {
  bytes: Uint8Array;
  contentType?: string;
  cacheControl?: string;
  etag: string;
}

export function fakeR2() {
  const objects = new Map<string, Stored>();
  const meta = (key: string, o: Stored) => ({
    key,
    size: o.bytes.byteLength,
    httpEtag: `"${o.etag}"`,
    writeHttpMetadata(h: Headers) {
      if (o.contentType) h.set('Content-Type', o.contentType);
      if (o.cacheControl) h.set('Cache-Control', o.cacheControl);
    },
  });
  return {
    objects,
    async put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) {
      const o: Stored = {
        bytes: new Uint8Array(value),
        contentType: opts?.httpMetadata?.contentType,
        cacheControl: opts?.httpMetadata?.cacheControl,
        etag: crypto.randomUUID().replaceAll('-', ''),
      };
      objects.set(key, o);
      return meta(key, o);
    },
    async get(key: string, opts?: { onlyIf?: Headers }) {
      const o = objects.get(key);
      if (!o) return null;
      const m = meta(key, o);
      if (opts?.onlyIf?.get('If-None-Match') === m.httpEtag) return m;
      return { ...m, body: new Blob([o.bytes]).stream() };
    },
    async delete(key: string) {
      objects.delete(key);
    },
  };
}

export const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';

export function makeEnv(migrationsDir: string, overrides: Partial<Env> = {}) {
  const DB = fakeD1(migrationsDir);
  const MEDIA = fakeR2();
  const env = {
    DB,
    MEDIA,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    ADMIN_TOKEN,
    ...overrides,
  } as unknown as Env;
  return { env, DB, MEDIA };
}
