-- The boutique doesn't sell online: replace the product catalogue with what the site actually has —
-- menu pages (Produits, Notre équipe…), a blog, and business details in settings.

DROP TABLE product_images;
DROP TABLE products;
DROP TABLE categories;

-- Pages: where they sit in the menu, and a header image. Bodies are HTML.
ALTER TABLE pages ADD COLUMN nav_section TEXT NOT NULL DEFAULT '' CHECK (length(nav_section) <= 60);
ALTER TABLE pages ADD COLUMN nav_label   TEXT NOT NULL DEFAULT '' CHECK (length(nav_label) <= 100);
ALTER TABLE pages ADD COLUMN position    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pages ADD COLUMN hero_image  TEXT NOT NULL DEFAULT '' CHECK (length(hero_image) <= 500);
ALTER TABLE pages ADD COLUMN excerpt     TEXT NOT NULL DEFAULT '' CHECK (length(excerpt) <= 500);

CREATE INDEX pages_nav ON pages (status, nav_section, position);

CREATE TABLE posts (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 160),
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  excerpt         TEXT NOT NULL DEFAULT '' CHECK (length(excerpt) <= 500),
  body            TEXT NOT NULL DEFAULT '',
  cover_image     TEXT NOT NULL DEFAULT '' CHECK (length(cover_image) <= 500),
  category        TEXT NOT NULL DEFAULT '' CHECK (length(category) <= 100),
  category_slug   TEXT NOT NULL DEFAULT '' CHECK (length(category_slug) <= 120),
  seo_description TEXT NOT NULL DEFAULT '' CHECK (length(seo_description) <= 300),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- A published post with a future date stays hidden until then.
  published_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX posts_feed ON posts (status, published_at DESC, id DESC);
CREATE INDEX posts_category ON posts (category_slug, status, published_at DESC, id DESC);

-- Business details, in French, from the old site.
DELETE FROM settings;
INSERT INTO settings (key, value) VALUES
  ('site_name',     '"Lingerie & Maillots Christine"'),
  ('site_url',      '"https://lingerie.scrov.app"'),
  ('tagline',       '"Lingerie féminine pour toutes les tailles!"'),
  ('announcement',  '""'),
  ('hero_title',    '"Belle et bien, sans compromis"'),
  ('hero_subtitle', '"Un service personnalisé, empreint d’écoute, de bienveillance et de respect."'),
  ('hero_image',    '""'),
  ('home_intro',    '""'),
  ('phone',         '"450-304-3555"'),
  ('email',         '""'),
  ('address',       '"1085, boulevard Lachapelle (route 158), Saint-Jérôme (Québec) J7Z 7M4"'),
  ('map_url',       '"https://www.google.com/maps/search/?api=1&query=1085+boulevard+Lachapelle+Saint-J%C3%A9r%C3%B4me+QC+J7Z+7M4"'),
  ('hours',         '[{"days":"Dimanche et lundi","hours":"Fermé"},{"days":"Mardi","hours":"9 h 30 à 17 h"},{"days":"Mercredi","hours":"9 h 30 à 17 h 30"},{"days":"Jeudi","hours":"9 h 30 à 17 h 30"},{"days":"Vendredi","hours":"9 h 30 à 17 h"},{"days":"Samedi","hours":"10 h à 16 h"}]'),
  ('facebook_url',  '""'),
  ('instagram_url', '""'),
  ('review_url',    '""'),
  ('footer_about',  '"Accompagner les femmes dans le choix d’une lingerie adaptée, avec un service personnalisé, empreint d’écoute, de bienveillance, d’empathie et de respect."');
