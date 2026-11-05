import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, switchMap } from 'rxjs';
import { Cms, loadable } from '../cms/cms';
import { bySection } from '../cms/format';
import { RichText } from '../shared/rich-text';
import { Seo } from '../shared/seo';

/** A CMS page at /page/:slug — product categories, the team page, etc. */
@Component({
  selector: 'app-content-page',
  imports: [RouterLink, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (result().state) {
      @case ('ready') {
        @let p = page()!;
        <header class="page-hero" [class.with-image]="!!p.hero_image">
          <div class="container">
            <h1>{{ p.title }}</h1>
            @if (p.excerpt) {
              <p class="lead">{{ p.excerpt }}</p>
            }
          </div>
          @if (p.hero_image) {
            <img [src]="p.hero_image" alt="" />
          }
        </header>
        <article class="container narrow body">
          <app-rich-text [html]="p.body" />
        </article>
        @if (siblings().length > 1) {
          <nav class="container narrow siblings" aria-label="Dans la même section">
            @for (s of siblings(); track s.slug) {
              <a [routerLink]="['/page', s.slug]" [attr.aria-current]="s.slug === p.slug ? 'page' : null">{{ s.nav_label }}</a>
            }
          </nav>
        }
      }
      @case ('loading') {
        <p class="container narrow pad muted">Chargement…</p>
      }
      @case ('missing') {
        <div class="container narrow pad">
          <h1>Page introuvable</h1>
          <p>Cette page n’existe pas ou plus. <a routerLink="/">Retour à l’accueil</a>.</p>
        </div>
      }
      @default {
        <div class="container narrow pad">
          <h1>Un problème est survenu</h1>
          <p>La page ne peut pas être affichée pour le moment. Réessayez dans quelques instants.</p>
        </div>
      }
    }
  `,
  styles: `
    .page-hero { background: var(--blush); padding: clamp(40px, 6vw, 72px) 0; position: relative; overflow: hidden; }
    .page-hero.with-image { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.6fr); align-items: center; padding-bottom: 0; padding-top: 0; }
    .page-hero.with-image .container { padding-top: clamp(40px, 6vw, 72px); padding-bottom: clamp(40px, 6vw, 72px); }
    .page-hero img { width: 100%; height: 100%; max-height: 420px; object-fit: cover; }
    h1 { font-family: var(--serif); font-weight: 600; font-size: clamp(36px, 5vw, 56px); line-height: 1.05; color: var(--navy); margin: 0 0 12px; text-wrap: balance; }
    .lead { margin: 0; font-size: 18px; color: var(--text-soft); max-width: 36em; }
    .body { padding-top: 40px; }
    .siblings { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 40px; }
    .siblings a { padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; color: var(--navy); font-size: 14px; }
    .siblings a[aria-current] { background: var(--navy); color: #fff; border-color: var(--navy); }
    .pad { padding-top: 64px; }
    @media (max-width: 760px) { .page-hero.with-image { grid-template-columns: minmax(0, 1fr); } .page-hero img { max-height: 260px; } }
  `,
})
export class ContentPage {
  private readonly cms = inject(Cms);
  private readonly seo = inject(Seo);
  private readonly route = inject(ActivatedRoute);

  protected readonly result = toSignal(
    this.route.paramMap.pipe(switchMap((p) => loadable(this.cms.page(p.get('slug') ?? '')))),
    { requireSync: true },
  );
  protected readonly page = computed(() => {
    const r = this.result();
    return r.state === 'ready' ? r.value : null;
  });
  private readonly allPages = toSignal(this.cms.pages(), { initialValue: [] });
  protected readonly siblings = computed(() => {
    const p = this.page();
    return p?.nav_section ? bySection(this.allPages(), p.nav_section) : [];
  });

  constructor() {
    effect(() => {
      const r = this.result();
      if (r.state === 'missing') this.seo.notFound();
      if (r.state === 'ready') this.seo.set({ title: r.value.title, description: r.value.seo_description, image: r.value.hero_image });
    });
  }
}
