-- Privacy, consent, tracking and SEO settings (admin › Confidentialité), plus the two legal pages.
-- INSERT OR IGNORE: values already set in the admin are kept.

INSERT OR IGNORE INTO settings (key, value) VALUES
  -- Cookie consent banner. It appears only when a measurement or advertising tool below is configured.
  ('consent_enabled',          'true'),
  ('consent_version',          '1'),
  ('consent_title',            '"Votre vie privée"'),
  ('consent_message',          '"Nous utilisons des témoins (cookies) pour mesurer l’audience du site et l’efficacité de nos publicités. Ils ne sont activés qu’avec votre accord, et vous pouvez changer d’avis en tout temps."'),
  ('consent_accept_label',     '"Tout accepter"'),
  ('consent_reject_label',     '"Tout refuser"'),
  ('consent_customize_label',  '"Personnaliser"'),
  ('consent_save_label',       '"Enregistrer mes choix"'),
  ('consent_analytics_label',  '"Mesure d’audience"'),
  ('consent_analytics_text',   '"Statistiques de visite (Google Analytics) pour savoir quelles pages sont utiles et améliorer le site."'),
  ('consent_marketing_label',  '"Marketing"'),
  ('consent_marketing_text',   '"Mesure de l’efficacité de nos publicités (Google Ads, Meta)."'),
  -- Legal pages, by slug.
  ('privacy_page',             '"politique-de-confidentialite"'),
  ('terms_page',               '"conditions-d-utilisation"'),
  -- Measurement and advertising (empty = off).
  ('ga4_id',                   '""'),
  ('google_ads_id',            '""'),
  ('gtm_id',                   '""'),
  ('meta_pixel_id',            '""'),
  -- Ownership verification meta tags.
  ('google_site_verification', '""'),
  ('bing_site_verification',   '""'),
  ('facebook_domain_verification', '""'),
  -- Search engines and social previews.
  ('seo_description',          '"Lingerie féminine pour toutes les tailles, maillots de bain et vêtements post-opératoires à Saint-Jérôme. Service-conseil personnalisé et prise de mesures."'),
  ('seo_image',                '""'),
  ('seo_noindex',              'false');

-- Templates to review and complete (look for « À compléter »), then publish from the admin.
-- They stay drafts until then, so nothing unreviewed appears on the site.
INSERT OR IGNORE INTO pages (slug, title, nav_section, nav_label, position, status, excerpt, body) VALUES
('politique-de-confidentialite', 'Politique de confidentialité', 'legal', 'Confidentialité', 1, 'draft',
 'Quels renseignements nous recueillons, pourquoi, et comment exercer vos droits.',
 '<p><em>Dernière mise à jour : [À compléter : date]</em></p>
<p>Lingerie &amp; Maillots Christine (« nous ») respecte votre vie privée. Cette politique explique quels renseignements personnels nous recueillons par ce site et en boutique, pourquoi nous les recueillons et comment exercer vos droits, conformément à la Loi sur la protection des renseignements personnels dans le secteur privé du Québec.</p>
<h2>Personne responsable</h2>
<p>[À compléter : nom et titre de la personne responsable de la protection des renseignements personnels]<br>Lingerie &amp; Maillots Christine, 1085, boulevard Lachapelle, Saint-Jérôme (Québec) J7Z 7M4<br>Téléphone : 450-304-3555<br>Courriel : [À compléter]</p>
<h2>Renseignements que nous recueillons</h2>
<ul>
<li><strong>Quand vous nous joignez</strong> (téléphone, courriel, réseaux sociaux) : votre nom, vos coordonnées et votre message, pour vous répondre.</li>
<li><strong>En boutique</strong> : [À compléter : p. ex. coordonnées pour une commande spéciale ou un certificat-cadeau].</li>
<li><strong>En naviguant sur ce site</strong> : le site n’a ni compte ni formulaire. Les données techniques nécessaires à son fonctionnement (adresse IP, type de navigateur) sont traitées par notre hébergeur pour afficher les pages et protéger le site.</li>
</ul>
<h2>Témoins (cookies) et outils de mesure</h2>
<p>Le site enregistre dans votre navigateur votre choix au sujet des témoins. Avec votre accord seulement, il peut aussi utiliser :</p>
<ul>
<li><strong>Mesure d’audience</strong> (Google Analytics) : statistiques de visite pour améliorer le site.</li>
<li><strong>Marketing</strong> (Google Ads, Meta) : mesure de l’efficacité de nos publicités.</li>
</ul>
<p>Ces outils sont désactivés par défaut. Vous pouvez changer votre choix en tout temps avec le lien « Gérer les témoins » au bas de chaque page.</p>
<h2>Communication à des tiers</h2>
<p>Nous ne vendons ni ne louons vos renseignements. Ils peuvent être traités par nos fournisseurs, uniquement pour les fins décrites ici : l’hébergement du site (Cloudflare) et, si vous y consentez, Google et Meta. Certains de ces fournisseurs conservent des données à l’extérieur du Québec.</p>
<h2>Conservation et sécurité</h2>
<p>Nous conservons vos renseignements le temps nécessaire aux fins pour lesquelles ils ont été recueillis, puis nous les détruisons de façon sécuritaire. [À compléter : durées précises au besoin]</p>
<h2>Vos droits</h2>
<p>Vous pouvez demander l’accès à vos renseignements, leur rectification ou retirer votre consentement en écrivant à la personne responsable ci-dessus. Nous répondons dans un délai de 30 jours. Si notre réponse ne vous satisfait pas, vous pouvez vous adresser à la <a href="https://www.cai.gouv.qc.ca/">Commission d’accès à l’information du Québec</a>.</p>
<h2>Modifications</h2>
<p>Toute modification de cette politique sera publiée sur cette page, avec sa date de mise à jour.</p>'),
('conditions-d-utilisation', 'Conditions d’utilisation', 'legal', 'Conditions d’utilisation', 2, 'draft',
 'Les règles qui encadrent l’utilisation de ce site.',
 '<p><em>Dernière mise à jour : [À compléter : date]</em></p>
<p>En utilisant le site de Lingerie &amp; Maillots Christine, vous acceptez les conditions suivantes.</p>
<h2>Information présentée</h2>
<p>Le site présente notre boutique, nos produits et nos services à titre informatif. Les produits, tailles, couleurs, prix et heures d’ouverture peuvent changer sans préavis : communiquez avec nous ou passez en boutique pour confirmer la disponibilité. Aucune vente n’est conclue sur ce site.</p>
<h2>Propriété intellectuelle</h2>
<p>Les textes, logos et photos du site appartiennent à Lingerie &amp; Maillots Christine ou à leurs auteurs et marques respectifs. Toute reproduction sans autorisation écrite est interdite.</p>
<h2>Liens vers d’autres sites</h2>
<p>Le site contient des liens vers des sites de tiers (réseaux sociaux, cartes, avis). Nous ne sommes pas responsables de leur contenu ni de leurs pratiques en matière de confidentialité.</p>
<h2>Responsabilité</h2>
<p>Nous faisons notre possible pour que l’information soit exacte et à jour, sans pouvoir le garantir. Les articles du blogue sont des conseils généraux et ne remplacent pas l’avis d’un professionnel de la santé.</p>
<h2>Confidentialité</h2>
<p>Notre <a href="/page/politique-de-confidentialite">politique de confidentialité</a> explique comment nous traitons vos renseignements personnels.</p>
<h2>Droit applicable</h2>
<p>Ces conditions sont régies par les lois applicables au Québec.</p>
<h2>Nous joindre</h2>
<p>Lingerie &amp; Maillots Christine, 1085, boulevard Lachapelle, Saint-Jérôme (Québec) J7Z 7M4, 450-304-3555.</p>');
