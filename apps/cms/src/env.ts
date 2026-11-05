export interface Env {
  /** Content database (D1: lingerie-cms). */
  DB: D1Database;
  /** Uploaded images (R2: lingerie-media). */
  MEDIA: R2Bucket;
  /** Static admin UI from ./public. */
  ASSETS: Fetcher;
  /** Secret. Bearer token for /api/admin/*. Set with `wrangler secret put ADMIN_TOKEN`. */
  ADMIN_TOKEN?: string;
}
