export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

// Messages are French because the admin shows them to editors as-is. Codes stay English for clients.
export const notFound = (what = 'Ressource') => new HttpError(404, 'not_found', `${what} introuvable`);
export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new HttpError(400, 'invalid_request', message, details);

export const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=300';

export function json(data: unknown, init: { status?: number; headers?: HeadersInit; cache?: string } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', init.cache ?? 'no-store');
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function errorResponse(err: HttpError, requestId: string): Response {
  return json(
    { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}), request_id: requestId } },
    { status: err.status },
  );
}

/** CORS for the public, read-only API. Admin routes never get these headers. */
export function withCors(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', '*');
  out.headers.set('Access-Control-Expose-Headers', 'ETag');
  out.headers.set('Vary', 'Origin');
  return out;
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
      'Access-Control-Max-Age': '86400',
    },
  });
}

const MAX_JSON_BYTES = 1_000_000;

export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Le corps de la requête doit être en application/json');
  }
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, 'payload_too_large', 'Contenu trop volumineux (1 Mo maximum)');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw badRequest('JSON invalide');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Un objet JSON est attendu');
  return body as Record<string, unknown>;
}

/**
 * Turns SQLite constraint failures into 4xx responses. Anything else is rethrown
 * so it surfaces as a logged 500 instead of being swallowed.
 */
export function mapDbError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const unique = /UNIQUE constraint failed: (\w+)\.(\w+)/.exec(msg);
  if (unique) {
    throw new HttpError(409, 'conflict', `${unique[2]} : cette valeur est déjà utilisée`, { field: unique[2] });
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    throw new HttpError(400, 'invalid_reference', 'Un élément référencé n’existe pas');
  }
  const check = /CHECK constraint failed: ?(.*?)(?::\s*SQLITE_CONSTRAINT.*)?$/.exec(msg);
  if (check) {
    const constraint = check[1] ?? '';
    const field = fieldFromConstraint(constraint);
    const message = field ? `${field} : valeur hors limites` : 'Une valeur est hors limites';
    throw new HttpError(400, 'invalid_value', message, field ? { field, constraint } : { constraint });
  }
  throw err;
}

const NOT_COLUMNS = new Set(['IS', 'NULL', 'NOT', 'OR', 'AND', 'IN', 'BETWEEN', 'LENGTH', 'JSON_VALID', 'JSON_TYPE']);

/** First column named in a CHECK expression, e.g. "length(title) BETWEEN 1 AND 200" -> title. */
function fieldFromConstraint(constraint: string): string | undefined {
  const words = constraint.replace(/'[^']*'/g, '').match(/[a-z_][a-z0-9_]*/gi) ?? [];
  return words.find((w) => !NOT_COLUMNS.has(w.toUpperCase()));
}
