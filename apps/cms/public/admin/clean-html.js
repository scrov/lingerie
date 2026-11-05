// Reduces arbitrary HTML (pasted from Word, the old site, etc.) to a small, safe set of tags.
// Used by the admin editor on paste and save, and by the one-time import of the old site.

const KEEP = {
  P: [], BR: [], STRONG: [], EM: [], U: [], A: ['href', 'title'], UL: [], OL: [], LI: [],
  H2: [], H3: [], H4: [], BLOCKQUOTE: [], IMG: ['src', 'alt'], FIGURE: [], FIGCAPTION: [], HR: [],
};
const RENAME = { B: 'STRONG', I: 'EM', H1: 'H2', H5: 'H4', H6: 'H4' };
const DROP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'META', 'LINK', 'OBJECT', 'EMBED', 'HEAD', 'TITLE']);
const BLOCK = new Set(['P', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'FIGURE', 'HR', 'DIV', 'SECTION', 'ARTICLE', 'TABLE', 'H1', 'H5', 'H6']);

function safeUrl(value, attr) {
  const v = (value || '').trim();
  if (!v) return null;
  if (/^(https?:|\/(?!\/)|#|\.{0,2}\/)/i.test(v)) return v;
  if (attr === 'href' && /^(mailto:|tel:)/i.test(v)) return v;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // plain relative path
  return null; // javascript:, data:, etc.
}

/**
 * @param {string} html
 * @param {{ rewriteUrl?: (url: string, attr: 'href' | 'src') => string | null, doc?: Document }} [opts]
 * @returns {string}
 */
export function cleanHtml(html, opts = {}) {
  const doc = opts.doc || document;
  const src = doc.createElement('div');
  src.innerHTML = html;
  const out = doc.createElement('div');

  const BLOCK_SELECTOR = 'p, ul, ol, li, h1, h2, h3, h4, h5, h6, blockquote, figure, hr, div, section, article, table, iframe';
  const hasBlockChild = (el) => el.querySelector(BLOCK_SELECTOR) !== null;

  function copyChildren(from, to) {
    for (const node of [...from.childNodes]) copyNode(node, to);
  }

  function copyNode(node, parent) {
    if (node.nodeType === 3) {
      parent.append(doc.createTextNode(node.nodeValue.replace(/ /g, ' ')));
      return;
    }
    if (node.nodeType !== 1) return;
    let tag = node.tagName;
    if (DROP.has(tag)) return;
    if (tag === 'IFRAME') {
      const s = safeUrl(node.getAttribute('src'), 'href');
      if (s) {
        const a = doc.createElement('a');
        a.setAttribute('href', s.startsWith('//') ? `https:${s}` : s);
        a.textContent = 'Voir la vidéo';
        if (parent.tagName === 'P' || parent.tagName === 'LI') parent.append(a);
        else {
          const p = doc.createElement('p');
          p.append(a);
          parent.append(p);
        }
      }
      return;
    }
    if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'TD' || tag === 'TH') {
      if (hasBlockChild(node) || parent.tagName === 'P' || parent.tagName === 'LI') copyChildren(node, parent);
      else {
        const p = doc.createElement('p');
        copyChildren(node, p);
        parent.append(p);
      }
      return;
    }
    tag = RENAME[tag] || tag;
    const allowed = KEEP[tag];
    if (!allowed) {
      copyChildren(node, parent); // unwrap SPAN, FONT, TABLE…
      return;
    }
    const el = doc.createElement(tag);
    for (const attr of allowed) {
      let v = node.getAttribute(attr);
      if (v === null) continue;
      if (attr === 'href' || attr === 'src') {
        v = safeUrl(v, attr);
        if (v && opts.rewriteUrl) v = opts.rewriteUrl(v, attr);
        if (!v) continue;
      }
      el.setAttribute(attr, v.trim());
    }
    if (tag === 'A' && !el.hasAttribute('href')) {
      copyChildren(node, parent); // a link whose address was unsafe or missing keeps only its text
      return;
    }
    if (tag === 'A' && /^https?:/i.test(el.getAttribute('href') || '')) el.setAttribute('rel', 'noopener');
    if (tag === 'IMG') {
      if (!el.getAttribute('src')) return;
      if (!el.hasAttribute('alt')) el.setAttribute('alt', '');
    }
    copyChildren(node, el);
    parent.append(el);
  }

  copyChildren(src, out);

  // Inline content left at the top level goes into paragraphs.
  let pending = null;
  for (const node of [...out.childNodes]) {
    if (node.nodeType === 1 && BLOCK.has(node.tagName)) {
      pending = null;
      continue;
    }
    if (node.nodeType === 3 && !node.nodeValue.trim() && !pending) {
      node.remove();
      continue;
    }
    if (!pending) {
      pending = doc.createElement('p');
      out.insertBefore(pending, node);
    }
    pending.append(node);
  }

  // A paragraph can't hold block elements; headings don't need bold.
  for (const p of [...out.querySelectorAll('p')]) {
    if (p.querySelector('p, ul, ol, h2, h3, h4, blockquote, figure, hr')) p.replaceWith(...p.childNodes);
  }
  for (const b of [...out.querySelectorAll('h2 strong, h3 strong, h4 strong')]) b.replaceWith(...b.childNodes);

  // Drop empty paragraphs/headings/links, trim whitespace-only <br> runs.
  for (const el of [...out.querySelectorAll('p, h2, h3, h4, li, a, strong, em, u, blockquote')]) {
    if (!el.textContent.trim() && !el.querySelector('img')) el.remove();
  }
  for (const p of out.querySelectorAll('p')) {
    while (p.firstChild && p.firstChild.nodeName === 'BR') p.firstChild.remove();
    while (p.lastChild && p.lastChild.nodeName === 'BR') p.lastChild.remove();
  }

  return [...out.childNodes]
    .map((n) => (n.nodeType === 1 ? n.outerHTML : n.nodeValue))
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
