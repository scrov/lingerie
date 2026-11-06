import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, startWith } from 'rxjs';

/** Base URL of the CMS Worker (apps/cms). For local work: { provide: CMS_URL, useValue: 'http://localhost:8787' }. */
export const CMS_URL = new InjectionToken<string>('CMS_URL', {
  providedIn: 'root',
  factory: () => 'https://lingerie-cms.scrov.app',
});

export interface OpeningHours {
  days: string;
  hours: string;
}

export interface GalleryImage {
  src: string;
  alt: string;
}

/** Site-wide values edited under « Réglages » in the admin. Every field may be empty. */
export interface SiteSettings {
  site_name?: string;
  tagline?: string;
  logo?: string;
  announcement?: string;
  hero_title?: string;
  hero_subtitle?: string;
  hero_image?: string;
  home_intro?: string;
  home_gallery?: GalleryImage[];
  home_video_url?: string;
  phone?: string;
  email?: string;
  address?: string;
  map_url?: string;
  hours?: OpeningHours[];
  facebook_url?: string;
  instagram_url?: string;
  review_url?: string;
  footer_about?: string;

  // Cookie consent banner (admin › Confidentialité)
  consent_enabled?: boolean;
  consent_version?: number;
  consent_title?: string;
  consent_message?: string;
  consent_accept_label?: string;
  consent_reject_label?: string;
  consent_customize_label?: string;
  consent_save_label?: string;
  consent_analytics_label?: string;
  consent_analytics_text?: string;
  consent_marketing_label?: string;
  consent_marketing_text?: string;
  /** Slugs of the CMS pages linked as the privacy policy and the terms of use. */
  privacy_page?: string;
  terms_page?: string;

  // Measurement and advertising, loaded only after consent
  ga4_id?: string;
  google_ads_id?: string;
  gtm_id?: string;
  meta_pixel_id?: string;

  // Ownership verification and search engines
  google_site_verification?: string;
  bing_site_verification?: string;
  facebook_domain_verification?: string;
  seo_description?: string;
  seo_image?: string;
  seo_noindex?: boolean;
}

export interface PageSummary {
  slug: string;
  title: string;
  nav_section: string;
  nav_label: string;
  position: number;
  hero_image: string;
  excerpt: string;
}

export interface Page {
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  hero_image: string;
  seo_description: string;
  nav_section: string;
  updated_at: string;
}

export interface PostSummary {
  slug: string;
  title: string;
  excerpt: string;
  cover_image: string;
  category: string;
  category_slug: string;
  published_at: string;
}

export interface Post extends PostSummary {
  body: string;
  seo_description: string;
  updated_at: string;
  newer: PostSummary | null;
  older: PostSummary | null;
}

export interface PostCategory {
  name: string;
  slug: string;
  post_count: number;
}

export interface Paged<T> {
  data: T[];
  next_cursor: string | null;
}

/** Wraps a request so templates can show loading, not-found and error states. */
export type Loadable<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'missing' }
  | { state: 'error' };

export function loadable<T>(source: Observable<T>): Observable<Loadable<T>> {
  return source.pipe(
    map((value): Loadable<T> => ({ state: 'ready', value })),
    catchError((err: unknown) =>
      of<Loadable<T>>(err instanceof HttpErrorResponse && err.status === 404 ? { state: 'missing' } : { state: 'error' }),
    ),
    startWith<Loadable<T>>({ state: 'loading' }),
  );
}

@Injectable({ providedIn: 'root' })
export class Cms {
  private readonly http = inject(HttpClient);
  private readonly base = inject(CMS_URL).replace(/\/+$/, '');

  // Site-wide data is fetched once per app instance (once per request during SSR) and shared.
  // Failures resolve to empty values so the layout still renders if the CMS is briefly unreachable.
  private readonly settings$ = this.http
    .get<SiteSettings>(`${this.base}/api/settings`)
    .pipe(catchError((err: unknown) => this.fallback('settings', err, {} as SiteSettings)), shareReplay(1));
  private readonly pages$ = this.http
    .get<{ data: PageSummary[] }>(`${this.base}/api/pages`)
    .pipe(map((r) => r.data), catchError((err: unknown) => this.fallback('pages', err, [] as PageSummary[])), shareReplay(1));

  /** Logs (server log or browser console) and carries on with an empty value. */
  private fallback<T>(what: string, err: unknown, value: T): Observable<T> {
    const status = err instanceof HttpErrorResponse ? err.status : undefined;
    const message = err instanceof Error ? err.message : err instanceof HttpErrorResponse ? err.message : String(err);
    console.error(JSON.stringify({ msg: 'cms_unavailable', what, status, message }));
    return of(value);
  }

  settings(): Observable<SiteSettings> {
    return this.settings$;
  }

  /** Published pages, ordered by menu section then position. */
  pages(): Observable<PageSummary[]> {
    return this.pages$;
  }

  page(slug: string): Observable<Page> {
    return this.http.get<Page>(`${this.base}/api/pages/${encodeURIComponent(slug)}`);
  }

  posts(opts: { category?: string | null; limit?: number; cursor?: string | null } = {}): Observable<Paged<PostSummary>> {
    let params = new HttpParams();
    if (opts.category) params = params.set('category', opts.category);
    if (opts.limit) params = params.set('limit', String(opts.limit));
    if (opts.cursor) params = params.set('cursor', opts.cursor);
    return this.http.get<Paged<PostSummary>>(`${this.base}/api/posts`, { params });
  }

  post(slug: string): Observable<Post> {
    return this.http.get<Post>(`${this.base}/api/posts/${encodeURIComponent(slug)}`);
  }

  postCategories(): Observable<PostCategory[]> {
    return this.http.get<{ data: PostCategory[] }>(`${this.base}/api/post-categories`).pipe(map((r) => r.data));
  }
}
