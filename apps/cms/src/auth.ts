import type { Env } from './env';
import { HttpError } from './http';

const MIN_TOKEN_LENGTH = 24;

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/** Compares fixed-length digests so the check takes the same time whatever the input. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export async function requireAdmin(req: Request, env: Env): Promise<void> {
  const expected = env.ADMIN_TOKEN;
  if (!expected || expected.length < MIN_TOKEN_LENGTH) {
    throw new HttpError(
      503,
      'admin_disabled',
      `L’administration est désactivée tant que le secret ADMIN_TOKEN n’est pas défini (au moins ${MIN_TOKEN_LENGTH} caractères)`,
    );
  }
  const header = req.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !(await sameSecret(match[1]!.trim(), expected))) {
    throw new HttpError(401, 'unauthorized', 'Jeton d’administration manquant ou invalide');
  }
}
