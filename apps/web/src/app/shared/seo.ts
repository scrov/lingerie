import { DOCUMENT, Injectable, RESPONSE_INIT, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SiteSettings } from '../cms/cms';

const SITE = 'Lingerie & Maillots Christine';

interface PageSeo {
  title?: string;
  description?: string;
  image?: string;
  type?: 'website' | 'article';
}

/** Verification tokens end up in meta tags: same formats the CMS enforces. */
const VERIFICATION: [keyof SiteSettings, string, RegExp][] = [
  ['google_site_verification', 'google-site-verification', /^[A-Za-z0-9_-]{10,100}$/],
  ['bing_site_verification', 'msvalidate.01', /^[A-F0-9]{16,64}$/],
  ['facebook_domain_verification', 'facebook-domain-verification', /^[a-z0-9]{16,64}$/],
];

/** Title, description, social preview and HTTP status for the page being rendered, plus site-wide tags from the CMS. */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly responseInit = inject(RESPONSE_INIT, { optional: true });

  private defaults: { description: string; image: string } = { description: '', image: '' };
  private current: PageSeo = {};

  set(opts: PageSeo): void {
    this.current = opts;
    const full = opts.title ? `${opts.title} · ${SITE}` : SITE;
    this.title.setTitle(full);
    this.meta.updateTag({ property: 'og:title', content: opts.title || SITE });
    this.meta.updateTag({ property: 'og:type', content: opts.type ?? 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: SITE });
    const description = opts.description || this.defaults.description;
    if (description) {
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:description', content: description });
    }
    const image = opts.image || this.defaults.image;
    if (image) this.meta.updateTag({ property: 'og:image', content: this.absolute(image) });
    else this.meta.removeTag("property='og:image'");
  }

  /** Site-wide values from the CMS (admin › Confidentialité): defaults, verification tags, indexing. */
  applySiteSettings(s: SiteSettings): void {
    this.defaults = { description: s.seo_description ?? '', image: s.seo_image ?? '' };
    for (const [key, name, format] of VERIFICATION) {
      const value = s[key];
      if (typeof value === 'string' && format.test(value)) this.meta.updateTag({ name, content: value });
      else this.meta.removeTag(`name='${name}'`);
    }
    if (s.seo_noindex === true) this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    else this.meta.removeTag("name='robots'");
    // Re-apply the current page so it picks up the defaults if it set nothing itself.
    this.set(this.current);
  }

  /** Marks the server response as 404 (no-op in the browser). */
  notFound(): void {
    if (this.responseInit) this.responseInit.status = 404;
    this.set({ title: 'Page introuvable' });
  }

  private absolute(url: string): string {
    if (!url.startsWith('/')) return url;
    const origin = this.document.location?.origin;
    return origin && origin !== 'null' ? origin + url : url;
  }
}
