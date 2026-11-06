import { badRequest, mapDbError } from '../http';
import { SLUG_RE, url } from '../validate';

const KEY_RE = /^[a-z][a-z0-9_]{0,99}$/;

export async function getSettings(db: D1Database): Promise<Record<string, unknown>> {
  const { results } = await db.prepare('SELECT key, value FROM settings ORDER BY key').all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)]));
}

// ---------- Known keys ----------
// Most settings are free-form (the storefront reads what it knows). The ones below end up in <script> URLs,
// meta tags or the consent banner, so they are checked here and again by the storefront before use.

type Rule = (value: unknown, key: string) => unknown;

function fail(key: string, message: string): never {
  throw badRequest(`${key} : ${message}`, { field: key });
}

const text =
  (max: number): Rule =>
  (v, key) => {
    if (v === null) return '';
    if (typeof v !== 'string') fail(key, 'doit être du texte');
    const s = v.trim();
    if (s.length > max) fail(key, `au plus ${max} caractères`);
    return s;
  };

const bool: Rule = (v, key) => {
  if (typeof v !== 'boolean') fail(key, 'doit valoir true ou false');
  return v;
};

const int =
  (min: number, max: number): Rule =>
  (v, key) => {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail(key, `nombre entier entre ${min} et ${max}`);
    return v;
  };

/** Empty, or an ID in the vendor's format. Upper-cased first so "g-abc123" is accepted as "G-ABC123". */
const id =
  (re: RegExp, example: string, upper = true): Rule =>
  (v, key) => {
    if (v === null) return '';
    if (typeof v !== 'string') fail(key, 'doit être du texte');
    const s = upper ? v.trim().toUpperCase() : v.trim();
    if (s !== '' && !re.test(s)) fail(key, `format attendu : ${example}`);
    return s;
  };

const pageSlug: Rule = (v, key) => {
  if (v === null) return '';
  if (typeof v !== 'string') fail(key, 'doit être du texte');
  const s = v.trim().toLowerCase();
  if (s !== '' && !SLUG_RE.test(s)) fail(key, 'adresse de page invalide');
  return s;
};

const imageUrl: Rule = (v, key) => (v === null ? '' : url({ [key]: v }, key));

export const KNOWN_SETTINGS: Record<string, Rule> = {
  // Cookie consent banner
  consent_enabled: bool,
  consent_version: int(1, 10_000),
  consent_title: text(120),
  consent_message: text(1000),
  consent_accept_label: text(40),
  consent_reject_label: text(40),
  consent_customize_label: text(40),
  consent_save_label: text(40),
  consent_analytics_label: text(80),
  consent_analytics_text: text(400),
  consent_marketing_label: text(80),
  consent_marketing_text: text(400),

  // Legal pages (slugs of CMS pages)
  privacy_page: pageSlug,
  terms_page: pageSlug,

  // Measurement and advertising, loaded only after consent
  ga4_id: id(/^G-[A-Z0-9]{4,20}$/, 'G-XXXXXXXXXX'),
  google_ads_id: id(/^AW-\d{6,15}$/, 'AW-123456789'),
  gtm_id: id(/^GTM-[A-Z0-9]{4,12}$/, 'GTM-XXXXXXX'),
  meta_pixel_id: id(/^\d{8,20}$/, '123456789012345'),

  // Ownership verification meta tags
  google_site_verification: id(/^[A-Za-z0-9_-]{10,100}$/, 'le code « content » fourni par Google', false),
  bing_site_verification: id(/^[A-F0-9]{16,64}$/, 'le code « content » fourni par Bing'),
  facebook_domain_verification: id(/^[a-z0-9]{16,64}$/, 'le code « content » fourni par Meta', false),

  // Search engines and social previews
  seo_description: text(300),
  seo_image: imageUrl,
  seo_noindex: bool,
};

/** Upserts every key in the body. Values can be any JSON; null clears a value but keeps the key. */
export async function putSettings(db: D1Database, body: Record<string, unknown>) {
  const entries = Object.entries(body);
  if (!entries.length) throw badRequest('Rien à mettre à jour');
  if (entries.length > 80) throw badRequest('80 réglages au plus par requête');
  const values: [string, unknown][] = [];
  for (const [key, raw] of entries) {
    if (!KEY_RE.test(key)) throw badRequest(`${key} : lettres minuscules, chiffres et _ seulement`, { field: key });
    const rule = Object.prototype.hasOwnProperty.call(KNOWN_SETTINGS, key) ? KNOWN_SETTINGS[key] : undefined;
    const value = rule ? rule(raw, key) : (raw ?? null);
    if (JSON.stringify(value).length > 50_000) throw badRequest(`${key} : valeur trop longue`, { field: key });
    values.push([key, value]);
  }
  try {
    await db.batch(
      values.map(([key, value]) =>
        db
          .prepare(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
          )
          .bind(key, JSON.stringify(value)),
      ),
    );
  } catch (err) {
    mapDbError(err);
  }
  return getSettings(db);
}
