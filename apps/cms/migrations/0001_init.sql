-- Lingerie CMS: initial content schema (Cloudflare D1 / SQLite)
-- Timestamps are ISO-8601 UTC strings. updated_at is set by the API on every write.

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 120),
  name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description TEXT    NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE products (
  id               INTEGER PRIMARY KEY,
  slug             TEXT    NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 120),
  name             TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description      TEXT    NOT NULL DEFAULT '',
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  compare_at_cents INTEGER CHECK (compare_at_cents IS NULL OR compare_at_cents > price_cents),
  currency         TEXT    NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  sizes            TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(sizes) AND json_type(sizes) = 'array'),
  colors           TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(colors) AND json_type(colors) = 'array'),
  materials        TEXT    NOT NULL DEFAULT '',
  care             TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  featured         INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX products_status_position ON products (status, position, id);
CREATE INDEX products_category ON products (category_id);

-- One row per object stored in the R2 bucket.
CREATE TABLE media (
  key          TEXT    PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 300),
  filename     TEXT    NOT NULL,
  content_type TEXT    NOT NULL,
  size         INTEGER NOT NULL CHECK (size >= 0),
  alt          TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE product_images (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_key  TEXT    NOT NULL REFERENCES media(key) ON DELETE CASCADE,
  alt        TEXT    NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, media_key)
);

CREATE INDEX product_images_media ON product_images (media_key);

CREATE TABLE pages (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 120),
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body            TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Site-wide values (site name, announcement bar, hero copy). Values are JSON.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 100),
  value      TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO settings (key, value) VALUES
  ('site_name',     '"Lingerie"'),
  ('announcement',  '""'),
  ('hero_title',    '"New collection"'),
  ('hero_subtitle', '""'),
  ('hero_image',    'null');

INSERT INTO categories (slug, name, position) VALUES
  ('bras',      'Bras',      1),
  ('briefs',    'Briefs',    2),
  ('bodysuits', 'Bodysuits', 3),
  ('sleepwear', 'Sleepwear', 4);
