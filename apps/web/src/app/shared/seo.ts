import { DOCUMENT, Injectable, RESPONSE_INIT, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

const SITE = 'Lingerie & Maillots Christine';

/** Title, description, social preview and HTTP status for the page being rendered. */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly responseInit = inject(RESPONSE_INIT, { optional: true });

  set(opts: { title?: string; description?: string; image?: string; type?: 'website' | 'article' }): void {
    const full = opts.title ? `${opts.title} · ${SITE}` : SITE;
    this.title.setTitle(full);
    this.meta.updateTag({ property: 'og:title', content: opts.title || SITE });
    this.meta.updateTag({ property: 'og:type', content: opts.type ?? 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: SITE });
    if (opts.description) {
      this.meta.updateTag({ name: 'description', content: opts.description });
      this.meta.updateTag({ property: 'og:description', content: opts.description });
    }
    if (opts.image) this.meta.updateTag({ property: 'og:image', content: this.absolute(opts.image) });
    else this.meta.removeTag("property='og:image'");
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
