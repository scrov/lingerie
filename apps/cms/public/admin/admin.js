// Administration du site Lingerie & Maillots Christine. JS simple, sans compilation.
// Parle à /api/admin/* du même Worker avec un jeton Bearer.

import { cleanHtml } from './clean-html.js';

const TOKEN_KEY = 'lingerie-cms-token';
const state = { token: readToken(), siteUrl: '' };
const app = document.getElementById('app');

// ---------- utilitaires ----------

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
function saveToken(token) {
  state.token = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible : le jeton reste en mémoire pour cet onglet */
  }
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

class ApiError extends Error {
  constructor(message, info) {
    super(message);
    this.info = info || {};
  }
}

async function api(method, path, body, extraHeaders = {}) {
  const headers = { Authorization: `Bearer ${state.token}`, ...extraHeaders };
  let payload;
  if (body instanceof Blob) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError('Erreur réseau. Vérifiez votre connexion et réessayez.');
  }
  if (res.status === 401) {
    saveToken('');
    if (path !== '/api/admin/me') render();
    throw new ApiError('Ce jeton a été refusé. Entrez-le de nouveau.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.message || `La requête a échoué (${res.status})`, data?.error);
  return data;
}

function toast(message, kind = 'ok') {
  const el = h('div', { class: `toast ${kind === 'error' ? 'error' : ''}` }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 2800);
}

function slugify(s) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const dateFmt = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium' });
const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '');

/** ISO UTC -> valeur pour <input type="datetime-local"> dans le fuseau du navigateur. */
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Les chemins « /uploads/… » appartiennent au site public ; on les affiche via site_url dans l’admin. */
function displayUrl(u) {
  if (u && u.startsWith('/') && !u.startsWith('//') && state.siteUrl) return state.siteUrl + u;
  return u;
}
function absolutize(html) {
  if (!state.siteUrl) return html;
  return html.replace(/(src|href)="\/(?!\/)/g, `$1="${state.siteUrl}/`);
}
function relativize(html) {
  if (!state.siteUrl) return html;
  return html.split(`="${state.siteUrl}/`).join('="/');
}

function field(label, input, hint) {
  return h('label', null, h('span', null, label, hint ? h('span', { class: 'hint' }, ` · ${hint}`) : null), input);
}

let groupId = 0;
/**
 * Like field(), but for composite widgets (rich editor, image picker). A <label> would forward every
 * click inside it to its first form control — the toolbar's style menu — and the text area could never get focus.
 */
function group(label, widget, hint) {
  const id = `group-${++groupId}`;
  return h('div', { class: 'field-group', role: 'group', 'aria-labelledby': id },
    h('span', { id, class: 'field-label' }, label, hint ? h('span', { class: 'hint' }, ` · ${hint}`) : null), widget);
}

/** Affiche une erreur d’API au-dessus du formulaire et signale le champ en cause. */
function showFormError(form, err) {
  form.querySelector('.alert')?.remove();
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  const fieldName = err?.info?.details?.field;
  const input = fieldName ? form.querySelector(`[name="${CSS.escape(fieldName)}"]`) : null;
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
  form.prepend(h('div', { class: 'alert', role: 'alert' }, err.message || String(err)));
  form.querySelector('.alert').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function busy(button, fn) {
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.disabled = false;
  }
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function uploadFile(file) {
  return api('POST', '/api/admin/media', file, {
    'Content-Type': file.type || 'application/octet-stream',
    'X-Filename': encodeURIComponent(file.name),
  });
}

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif,image/gif';

// ---------- composants ----------

/** Choix d’une image dans la médiathèque (ou téléversement). Résout avec l’objet média, ou null. */
async function pickMedia() {
  const { data } = await api('GET', '/api/admin/media');
  return new Promise((resolve) => {
    let picked = null;
    const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES, hidden: true });
    const uploadBtn = h('button', { type: 'button', onclick: () => fileInput.click() }, 'Téléverser une image');
    fileInput.addEventListener('change', () => busy(uploadBtn, async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        picked = await uploadFile(file);
        dialog.close();
      } catch (err) {
        toast(err.message, 'error');
      }
    }));
    const dialog = h('dialog', null,
      h('div', { class: 'card-head' }, h('h2', null, 'Choisir une image'),
        h('div', { class: 'row' }, uploadBtn, fileInput, h('button', { type: 'button', class: 'icon', onclick: () => dialog.close() }, 'Fermer'))),
      h('div', { class: 'card-body' }, data.length
        ? h('div', { class: 'media-grid' }, data.map((m) =>
            h('div', { class: 'tile' }, h('button', { class: 'pick', type: 'button', onclick: () => { picked = m; dialog.close(); } },
              h('img', { src: m.url, alt: m.alt || m.filename, loading: 'lazy' }),
              h('div', { class: 'meta' }, h('span', { class: 'name' }, m.filename))))))
        : h('div', { class: 'empty' }, 'La médiathèque est vide. Téléversez une première image.')),
    );
    dialog.addEventListener('close', () => { dialog.remove(); resolve(picked); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Champ URL d’image avec aperçu et bouton « Choisir ». */
function imageField(name, label, value, hint) {
  const input = h('input', { name, value: value || '', placeholder: 'https://… ou /uploads/…' });
  const preview = h('div', { class: 'image-preview' });
  const draw = () => {
    const u = input.value.trim();
    preview.replaceChildren(u ? h('img', { src: displayUrl(u), alt: '' }) : h('span', { class: 'muted' }, 'Aucune image'));
  };
  input.addEventListener('change', draw);
  draw();
  const wrap = h('div', { class: 'image-field' },
    preview,
    h('div', { class: 'image-field-controls' },
      input,
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: async () => { const m = await pickMedia(); if (m) { input.value = m.url; draw(); } } }, 'Choisir'),
        h('button', { type: 'button', onclick: () => { input.value = ''; draw(); } }, 'Retirer'))));
  return { el: group(label, wrap, hint), get value() { return input.value.trim(); } };
}

/** Éditeur de texte enrichi minimal : titres, gras, italique, listes, liens, images, citation, source HTML. */
function richEditor(name, initialHtml) {
  const area = h('div', { class: 'rte-content', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'data-name': name });
  const source = h('textarea', { class: 'rte-source tall', name, hidden: true, spellcheck: 'false' });
  area.innerHTML = absolutize(initialHtml || '');
  let sourceMode = false;

  const cmd = (command, value = null) => {
    area.focus();
    document.execCommand(command, false, value);
  };
  const btn = (label, title, onclick) =>
    h('button', { type: 'button', class: 'icon', title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick }, label);

  const block = h('select', { 'aria-label': 'Style du paragraphe', onchange: () => { cmd('formatBlock', block.value); block.value = 'p'; } },
    h('option', { value: 'p' }, 'Paragraphe'), h('option', { value: 'h2' }, 'Titre'), h('option', { value: 'h3' }, 'Sous-titre'), h('option', { value: 'blockquote' }, 'Citation'));

  const toolbar = h('div', { class: 'rte-toolbar' },
    block,
    btn(h('strong', null, 'G'), 'Gras', () => cmd('bold')),
    btn(h('em', null, 'I'), 'Italique', () => cmd('italic')),
    btn('• Liste', 'Liste à puces', () => cmd('insertUnorderedList')),
    btn('1. Liste', 'Liste numérotée', () => cmd('insertOrderedList')),
    btn('Lien', 'Insérer un lien', () => {
      const href = prompt('Adresse du lien (https://…, /page/…, tel:…, mailto:…)');
      if (href) cmd('createLink', href.trim());
    }),
    btn('Image', 'Insérer une image', async () => {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount && area.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
      const m = await pickMedia();
      if (!m) return;
      area.focus();
      if (range) { sel.removeAllRanges(); sel.addRange(range); }
      document.execCommand('insertHTML', false, `<img src="${m.url}" alt="${(m.alt || '').replace(/"/g, '&quot;')}">`);
    }),
    btn('Effacer', 'Retirer la mise en forme', () => cmd('removeFormat')),
    h('span', { class: 'spacer' }),
    btn('HTML', 'Voir / modifier le code HTML', () => {
      sourceMode = !sourceMode;
      if (sourceMode) {
        source.value = relativize(cleanHtml(area.innerHTML));
        area.hidden = true;
        source.hidden = false;
        toolbar.classList.add('source-mode');
      } else {
        area.innerHTML = absolutize(cleanHtml(source.value));
        source.hidden = true;
        area.hidden = false;
        toolbar.classList.remove('source-mode');
      }
    }),
  );

  area.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const clean = html
      ? cleanHtml(html)
      : text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('');
    document.execCommand('insertHTML', false, clean);
  });

  return {
    el: h('div', { class: 'rte' }, toolbar, area, source),
    get value() {
      return relativize(cleanHtml(sourceMode ? source.value : area.innerHTML));
    },
  };
}

// ---------- mise en page ----------

const NAV = [
  ['#/pages', 'Pages'],
  ['#/blogue', 'Blogue'],
  ['#/medias', 'Médias'],
  ['#/reglages', 'Réglages'],
];

function shell(content) {
  const current = '#/' + (location.hash.replace(/^#\/?/, '').split('/')[0] || 'pages');
  return h(
    'div',
    { class: 'shell' },
    h(
      'aside',
      { class: 'sidebar' },
      h('div', { class: 'brand' }, 'Lingerie Christine', h('small', null, 'Gestion du contenu')),
      h('nav', { class: 'nav' }, NAV.map(([href, label]) => h('a', { href, 'aria-current': href === current ? 'page' : null }, label))),
      h('div', { class: 'spacer' }),
      state.siteUrl ? h('a', { class: 'btn icon', href: state.siteUrl, target: '_blank', rel: 'noopener' }, 'Voir le site') : null,
      h('button', { class: 'icon', onclick: () => { saveToken(''); render(); } }, 'Se déconnecter'),
    ),
    h('main', null, content),
  );
}

function head(title, crumb, ...actions) {
  return h(
    'div',
    { class: 'page-head' },
    h('div', null, crumb ? h('div', { class: 'crumb' }, crumb) : null, h('h1', null, title)),
    h('div', { class: 'row' }, actions),
  );
}

function deleteButton(label, confirmText, path, after) {
  return h('button', { type: 'button', class: 'danger', onclick: async (e) => {
    if (!confirm(confirmText)) return;
    await busy(e.currentTarget, async () => {
      try { await api('DELETE', path); toast('Supprimé'); go(after); }
      catch (err) { toast(err.message, 'error'); }
    });
  } }, label);
}

const STATUS_LABEL = { draft: 'brouillon', published: 'publié' };

// ---------- connexion ----------

function loginView() {
  const input = h('input', { type: 'password', name: 'token', autocomplete: 'current-password', required: true, placeholder: 'Jeton d’administration' });
  const button = h('button', { class: 'primary', type: 'submit' }, 'Se connecter');
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        await busy(button, async () => {
          saveToken(input.value.trim());
          try {
            await api('GET', '/api/admin/me');
            render();
          } catch (err) {
            saveToken('');
            showFormError(form, err);
          }
        });
      },
    },
    h('h1', null, 'Lingerie & Maillots Christine'),
    h('p', { class: 'muted' }, 'Gestion du contenu du site. Entrez le jeton d’administration (secret ADMIN_TOKEN du Worker).'),
    field('Jeton', input),
    button,
  );
  return h('div', { class: 'login' }, h('div', { class: 'card' }, h('div', { class: 'card-body' }, form)));
}

// ---------- pages ----------

const SECTION_LABELS = { '': 'Hors menu', produits: 'Produits', equipe: 'Notre équipe' };

async function pagesView() {
  const { data } = await api('GET', '/api/admin/pages');
  const groups = new Map();
  for (const p of data) {
    const key = p.nav_section || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const body = data.length
    ? [...groups.entries()].map(([section, pages]) =>
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h2', null, SECTION_LABELS[section] ?? section), h('span', { class: 'muted' }, section ? `menu « ${section} »` : '')),
          h('table', null, h('tbody', null, pages.map((p) =>
            h('tr', { tabindex: 0, onclick: () => go(`#/pages/${p.id}`), onkeydown: (e) => e.key === 'Enter' && go(`#/pages/${p.id}`) },
              h('td', { class: 'thumb-cell' }, p.hero_image ? h('img', { class: 'thumb', src: displayUrl(p.hero_image), alt: '', loading: 'lazy' }) : h('div', { class: 'thumb' })),
              h('td', null, h('strong', null, p.title), h('div', { class: 'muted' }, `/page/${p.slug}`)),
              h('td', { class: 'hide-sm num' }, p.nav_section ? `#${p.position}` : ''),
              h('td', { class: 'num' }, h('span', { class: `badge ${p.status}` }, STATUS_LABEL[p.status]))))))))
    : h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Aucune page pour l’instant.'));
  return [head('Pages', null, h('a', { class: 'btn primary', href: '#/pages/nouvelle' }, 'Nouvelle page')), body];
}

async function pageEditView(id) {
  const isNew = id === 'nouvelle';
  const p = isNew
    ? { title: '', slug: '', body: '', excerpt: '', hero_image: '', seo_description: '', nav_section: '', nav_label: '', position: 0, status: 'draft' }
    : await api('GET', `/api/admin/pages/${id}`);
  let slugTouched = !isNew;
  const title = h('input', { name: 'title', value: p.title, required: true, maxlength: 200 });
  const slug = h('input', { name: 'slug', value: p.slug, maxlength: 120, placeholder: 'déduit du titre' });
  title.addEventListener('input', () => { if (!slugTouched) slug.value = slugify(title.value); });
  slug.addEventListener('input', () => { slugTouched = true; });
  const status = h('select', { name: 'status' }, h('option', { value: 'draft' }, 'Brouillon'), h('option', { value: 'published' }, 'Publiée'));
  status.value = p.status;
  const section = h('input', { name: 'nav_section', value: p.nav_section, list: 'sections', placeholder: 'vide = hors menu' });
  const sections = h('datalist', { id: 'sections' }, h('option', { value: 'produits' }, 'Produits'), h('option', { value: 'equipe' }, 'Notre équipe'));
  const navLabel = h('input', { name: 'nav_label', value: p.nav_label, maxlength: 100, placeholder: 'par défaut : le titre' });
  const position = h('input', { type: 'number', name: 'position', value: p.position, step: 1 });
  const hero = imageField('hero_image', 'Image d’en-tête', p.hero_image);
  const excerpt = h('textarea', { name: 'excerpt', maxlength: 500, rows: 3 });
  excerpt.value = p.excerpt;
  const seo = h('input', { name: 'seo_description', value: p.seo_description, maxlength: 300, placeholder: 'par défaut : le résumé' });
  const editor = richEditor('body', p.body);

  const save = h('button', { class: 'primary', type: 'submit' }, isNew ? 'Créer la page' : 'Enregistrer');
  const form = h('form', { onsubmit: (e) => {
    e.preventDefault();
    busy(save, async () => {
      try {
        const payload = {
          title: title.value, slug: slug.value.trim() || undefined, status: status.value,
          nav_section: section.value.trim(), nav_label: navLabel.value, position: Number(position.value || 0),
          hero_image: hero.value, excerpt: excerpt.value, seo_description: seo.value, body: editor.value,
        };
        const saved = isNew ? await api('POST', '/api/admin/pages', payload) : await api('PUT', `/api/admin/pages/${p.id}`, payload);
        toast(isNew ? 'Page créée' : 'Enregistré');
        go(`#/pages/${saved.id}`);
      } catch (err) { showFormError(form, err); }
    });
  } },
    h('div', { class: 'card' }, h('div', { class: 'card-body grid' },
      field('Titre', title), field('Adresse', slug, 'la page sera à /page/…'),
      h('div', { class: 'full' }, group('Contenu', editor.el)))),
    h('div', { class: 'card' }, h('div', { class: 'card-body grid' },
      h('div', { class: 'full' }, hero.el),
      field('Résumé', excerpt, 'affiché dans les listes ; par défaut le début du contenu'),
      field('Description pour Google', seo, '160 caractères idéalement'))),
    h('div', { class: 'card' }, h('div', { class: 'card-body grid grid-3' },
      field('Statut', status), field('Menu', section, 'produits, equipe…'), sections,
      field('Libellé dans le menu', navLabel), field('Ordre dans le menu', position, 'plus petit = plus haut'))),
    h('div', { class: 'sticky-actions' },
      isNew ? h('span') : h('div', { class: 'row' },
        deleteButton('Supprimer', `Supprimer la page « ${p.title} » ? Cette action est définitive.`, `/api/admin/pages/${p.id}`, '#/pages'),
        p.status === 'published' && state.siteUrl ? h('a', { class: 'btn', href: `${state.siteUrl}/page/${p.slug}`, target: '_blank', rel: 'noopener' }, 'Voir') : null),
      save));
  return [head(isNew ? 'Nouvelle page' : p.title, h('a', { href: '#/pages' }, 'Pages')), form];
}

// ---------- blogue ----------

async function postsView() {
  const { data } = await api('GET', '/api/admin/posts');
  const body = data.length
    ? h('table', null,
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Titre'), h('th', { class: 'hide-sm' }, 'Catégorie'), h('th', null, 'Date'), h('th', { class: 'num' }, 'Statut'))),
        h('tbody', null, data.map((p) => h('tr', { tabindex: 0, onclick: () => go(`#/blogue/${p.id}`), onkeydown: (e) => e.key === 'Enter' && go(`#/blogue/${p.id}`) },
          h('td', { class: 'thumb-cell' }, p.cover_image ? h('img', { class: 'thumb', src: displayUrl(p.cover_image), alt: '', loading: 'lazy' }) : h('div', { class: 'thumb' })),
          h('td', null, h('strong', null, p.title), h('div', { class: 'muted' }, `/blog/${p.slug}`)),
          h('td', { class: 'hide-sm' }, p.category || '—'),
          h('td', null, formatDate(p.published_at)),
          h('td', { class: 'num' }, p.scheduled ? h('span', { class: 'badge star' }, 'programmé') : h('span', { class: `badge ${p.status}` }, STATUS_LABEL[p.status]))))))
    : h('div', { class: 'empty' }, 'Aucun article pour l’instant.');
  return [head('Blogue', null, h('a', { class: 'btn primary', href: '#/blogue/nouveau' }, 'Nouvel article')), h('div', { class: 'card' }, body)];
}

async function postEditView(id) {
  const isNew = id === 'nouveau';
  const [p, list] = await Promise.all([
    isNew
      ? { title: '', slug: '', body: '', excerpt: '', cover_image: '', category: 'Actualités', category_slug: 'actualites-', seo_description: '', status: 'draft', published_at: new Date().toISOString() }
      : api('GET', `/api/admin/posts/${id}`),
    api('GET', '/api/admin/posts'),
  ]);
  const categories = [...new Set(list.data.map((x) => x.category).filter(Boolean))];
  let slugTouched = !isNew;
  const title = h('input', { name: 'title', value: p.title, required: true, maxlength: 200 });
  const slug = h('input', { name: 'slug', value: p.slug, maxlength: 160, placeholder: 'déduit du titre' });
  title.addEventListener('input', () => { if (!slugTouched) slug.value = slugify(title.value); });
  slug.addEventListener('input', () => { slugTouched = true; });
  const status = h('select', { name: 'status' }, h('option', { value: 'draft' }, 'Brouillon'), h('option', { value: 'published' }, 'Publié'));
  status.value = p.status;
  const date = h('input', { type: 'datetime-local', name: 'published_at', value: toLocalInput(p.published_at), required: true });
  const category = h('input', { name: 'category', value: p.category, list: 'categories', maxlength: 100 });
  const categoryList = h('datalist', { id: 'categories' }, categories.map((c) => h('option', { value: c })));
  const cover = imageField('cover_image', 'Image de couverture', p.cover_image);
  const excerpt = h('textarea', { name: 'excerpt', maxlength: 500, rows: 3 });
  excerpt.value = p.excerpt;
  const seo = h('input', { name: 'seo_description', value: p.seo_description, maxlength: 300, placeholder: 'par défaut : le résumé' });
  const editor = richEditor('body', p.body);

  const save = h('button', { class: 'primary', type: 'submit' }, isNew ? 'Créer l’article' : 'Enregistrer');
  const form = h('form', { onsubmit: (e) => {
    e.preventDefault();
    busy(save, async () => {
      try {
        const payload = {
          title: title.value, slug: slug.value.trim() || undefined, status: status.value,
          published_at: new Date(date.value).toISOString(), category: category.value.trim(),
          cover_image: cover.value, excerpt: excerpt.value, seo_description: seo.value, body: editor.value,
        };
        // Garde l’adresse de catégorie existante (p. ex. « actualites- » de l’ancien site) si le nom n’a pas changé.
        if (!isNew && category.value.trim() === p.category) payload.category_slug = p.category_slug;
        const saved = isNew ? await api('POST', '/api/admin/posts', payload) : await api('PUT', `/api/admin/posts/${p.id}`, payload);
        toast(isNew ? 'Article créé' : 'Enregistré');
        go(`#/blogue/${saved.id}`);
      } catch (err) { showFormError(form, err); }
    });
  } },
    h('div', { class: 'card' }, h('div', { class: 'card-body grid' },
      field('Titre', title), field('Adresse', slug, 'l’article sera à /blog/…'),
      h('div', { class: 'full' }, group('Contenu', editor.el)))),
    h('div', { class: 'card' }, h('div', { class: 'card-body grid' },
      h('div', { class: 'full' }, cover.el),
      field('Résumé', excerpt, 'affiché dans la liste du blogue ; par défaut le début du texte'),
      field('Description pour Google', seo, '160 caractères idéalement'))),
    h('div', { class: 'card' }, h('div', { class: 'card-body grid grid-3' },
      field('Statut', status), field('Date de publication', date, 'une date future programme l’article'),
      field('Catégorie', category), categoryList)),
    h('div', { class: 'sticky-actions' },
      isNew ? h('span') : h('div', { class: 'row' },
        deleteButton('Supprimer', `Supprimer l’article « ${p.title} » ? Cette action est définitive.`, `/api/admin/posts/${p.id}`, '#/blogue'),
        p.status === 'published' && state.siteUrl ? h('a', { class: 'btn', href: `${state.siteUrl}/blog/${p.slug}`, target: '_blank', rel: 'noopener' }, 'Voir') : null),
      save));
  return [head(isNew ? 'Nouvel article' : p.title, h('a', { href: '#/blogue' }, 'Blogue')), form];
}

// ---------- médiathèque ----------

async function mediaView() {
  const { data } = await api('GET', '/api/admin/media');
  const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES, multiple: true, hidden: true });
  const drop = h('div', { class: 'drop' }, 'Déposez des images ici ou ', h('button', { type: 'button', onclick: () => fileInput.click() }, 'choisissez des fichiers'), fileInput,
    h('div', { class: 'muted', style: 'margin-top:6px;font-size:13px' }, 'JPEG, PNG, WebP, AVIF ou GIF, 10 Mo maximum chacune'));
  const uploadAll = async (files) => {
    let ok = 0;
    for (const f of files) {
      try { await uploadFile(f); ok++; } catch (err) { toast(`${f.name} : ${err.message}`, 'error'); }
    }
    if (ok) toast(`${ok} image${ok > 1 ? 's' : ''} téléversée${ok > 1 ? 's' : ''}`);
    render();
  };
  fileInput.addEventListener('change', () => uploadAll([...fileInput.files]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); uploadAll([...e.dataTransfer.files]); });

  const tiles = data.map((m) => {
    const alt = h('input', { value: m.alt, placeholder: 'Texte alternatif', maxlength: 300, 'aria-label': `Texte alternatif de ${m.filename}` });
    alt.addEventListener('change', async () => {
      try { await api('PUT', `/api/admin/media/${m.key}`, { alt: alt.value }); toast('Texte alternatif enregistré'); }
      catch (err) { toast(err.message, 'error'); }
    });
    return h('div', { class: 'tile' },
      h('a', { href: m.url, target: '_blank', rel: 'noopener' }, h('img', { src: m.url, alt: m.alt || m.filename, loading: 'lazy' })),
      h('div', { class: 'meta' },
        h('span', { class: 'name', title: m.filename }, m.filename),
        h('span', null, `${Math.max(1, Math.round(m.size / 1024))} Ko · ${formatDate(m.created_at)}`),
        alt,
        h('div', { class: 'row' },
          h('button', { class: 'icon', onclick: async () => { await navigator.clipboard?.writeText(m.url).catch(() => {}); toast('Adresse copiée'); } }, 'Copier l’adresse'),
          h('button', { class: 'icon danger', onclick: async (e) => {
            if (!confirm(`Supprimer ${m.filename} ? Les pages qui l’utilisent afficheront une image manquante.`)) return;
            await busy(e.currentTarget, async () => {
              try { await api('DELETE', `/api/admin/media/${m.key}`); toast('Image supprimée'); render(); }
              catch (err) { toast(err.message, 'error'); }
            });
          } }, 'Supprimer'))));
  });
  return [head('Médias'), drop, data.length ? h('div', { class: 'media-grid' }, tiles) : h('div', { class: 'empty' }, 'Aucune image pour l’instant.')];
}

// ---------- réglages ----------

const TEXT_SETTINGS = [
  ['Identité', [
    ['site_name', 'Nom du commerce'],
    ['tagline', 'Slogan'],
    ['site_url', 'Adresse du site public', 'sert aux aperçus d’images et aux liens « Voir »'],
  ]],
  ['Coordonnées', [
    ['phone', 'Téléphone'],
    ['email', 'Courriel'],
    ['address', 'Adresse'],
    ['map_url', 'Lien Google Maps'],
  ]],
  ['Réseaux et avis', [
    ['facebook_url', 'Page Facebook'],
    ['instagram_url', 'Instagram'],
    ['review_url', 'Lien pour laisser un avis Google'],
  ]],
  ['Accueil', [
    ['announcement', 'Bandeau d’annonce', 'laisser vide pour le masquer'],
    ['hero_title', 'Grand titre'],
    ['hero_subtitle', 'Sous-titre'],
  ]],
];
const HANDLED = new Set(['hero_image', 'home_intro', 'hours', 'footer_about', ...TEXT_SETTINGS.flatMap(([, f]) => f.map(([k]) => k))]);

async function settingsView() {
  const values = await api('GET', '/api/admin/settings');
  const inputs = {};
  const groups = TEXT_SETTINGS.map(([title, fields]) =>
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title)),
      h('div', { class: 'card-body grid' }, fields.map(([key, label, hint]) => {
        inputs[key] = h('input', { name: key, value: values[key] ?? '' });
        return field(label, inputs[key], hint);
      }))));

  const hero = imageField('hero_image', 'Image d’accueil', values.hero_image || '');
  const intro = richEditor('home_intro', values.home_intro || '');
  const footer = h('textarea', { name: 'footer_about', rows: 3 });
  footer.value = values.footer_about || '';

  // Heures d’ouverture : lignes « jours / heures » modifiables.
  let hours = Array.isArray(values.hours) ? values.hours.map((r) => ({ ...r })) : [];
  const hoursList = h('div', { class: 'hours' });
  const drawHours = () => hoursList.replaceChildren(
    ...hours.map((row, i) => {
      const days = h('input', { value: row.days, placeholder: 'Mardi', 'aria-label': 'Jours' });
      const time = h('input', { value: row.hours, placeholder: '9 h 30 à 17 h', 'aria-label': 'Heures' });
      days.addEventListener('input', () => { row.days = days.value; });
      time.addEventListener('input', () => { row.hours = time.value; });
      return h('div', { class: 'hours-row' }, days, time,
        h('button', { type: 'button', class: 'icon danger', 'aria-label': 'Retirer la ligne', onclick: () => { hours.splice(i, 1); drawHours(); } }, '✕'));
    }),
    h('button', { type: 'button', onclick: () => { hours.push({ days: '', hours: '' }); drawHours(); } }, 'Ajouter une ligne'));
  drawHours();

  const extraKeys = Object.keys(values).filter((k) => !HANDLED.has(k));
  const extras = h('textarea', { name: 'extra', class: 'tall', style: 'min-height:120px' });
  extras.value = JSON.stringify(Object.fromEntries(extraKeys.map((k) => [k, values[k]])), null, 2);

  const save = h('button', { class: 'primary', type: 'submit' }, 'Enregistrer les réglages');
  const form = h('form', { onsubmit: (e) => {
    e.preventDefault();
    busy(save, async () => {
      try {
        let extra;
        try { extra = JSON.parse(extras.value || '{}'); } catch { throw new ApiError('extra : les autres réglages doivent être du JSON valide', { details: { field: 'extra' } }); }
        if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) throw new ApiError('extra : un objet JSON est attendu', { details: { field: 'extra' } });
        const body = { ...extra, hero_image: hero.value, home_intro: intro.value, footer_about: footer.value.trim(),
          hours: hours.filter((r) => r.days.trim() || r.hours.trim()).map((r) => ({ days: r.days.trim(), hours: r.hours.trim() })) };
        for (const key of Object.keys(inputs)) body[key] = inputs[key].value.trim();
        const saved = await api('PUT', '/api/admin/settings', body);
        state.siteUrl = (saved.site_url || '').replace(/\/+$/, '');
        toast('Réglages enregistrés');
      } catch (err) { showFormError(form, err); }
    });
  } },
    groups[0], groups[1],
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Heures d’ouverture')), h('div', { class: 'card-body' }, hoursList)),
    groups[2], groups[3],
    h('div', { class: 'card' }, h('div', { class: 'card-body grid' },
      h('div', { class: 'full' }, hero.el),
      h('div', { class: 'full' }, group('Texte de présentation (accueil)', intro.el)),
      h('div', { class: 'full' }, field('Texte du pied de page', footer)))),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Autres réglages')),
      h('div', { class: 'card-body' }, field('JSON', extras, 'valeurs supplémentaires lues par le site'))),
    h('div', { class: 'sticky-actions' }, h('span'), save));
  return [head('Réglages'), form];
}

// ---------- routeur ----------

async function loadSiteUrl() {
  if (state.siteUrl) return;
  try {
    const s = await api('GET', '/api/admin/settings');
    state.siteUrl = (s.site_url || '').replace(/\/+$/, '');
  } catch {
    /* sans site_url, les chemins /uploads/… ne s’affichent simplement pas en aperçu */
  }
}

async function render() {
  if (!state.token) {
    app.replaceChildren(loginView());
    return;
  }
  const [section = 'pages', id] = location.hash.replace(/^#\/?/, '').split('/');
  const views = {
    pages: () => (id ? pageEditView(id) : pagesView()),
    blogue: () => (id ? postEditView(id) : postsView()),
    medias: mediaView,
    reglages: settingsView,
  };
  const view = views[section] || pagesView;
  app.replaceChildren(shell(h('p', { class: 'muted' }, 'Chargement…')));
  try {
    await loadSiteUrl();
    const content = await view();
    if (!state.token) return;
    app.replaceChildren(shell(content));
    window.scrollTo(0, 0);
  } catch (err) {
    if (!state.token) return;
    app.replaceChildren(shell([head('Un problème est survenu'), h('div', { class: 'alert' }, err.message), h('button', { onclick: render }, 'Réessayer')]));
  }
}

window.addEventListener('hashchange', render);
render();
