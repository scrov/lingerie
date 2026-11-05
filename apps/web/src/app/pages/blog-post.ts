import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { Cms, loadable } from '../cms/cms';
import { FrDatePipe } from '../cms/format';
import { RichText } from '../shared/rich-text';
import { Seo } from '../shared/seo';

@Component({
  selector: 'app-blog-post',
  imports: [RouterLink, FrDatePipe, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (result().state) {
      @case ('ready') {
        @let p = post()!;
        <article>
          <header class="container narrow head">
            <nav class="crumbs" aria-label="Fil d’Ariane">
              <a routerLink="/blog">Blogue</a>
              @if (p.category) {
                <span aria-hidden="true">/</span>
                <a [routerLink]="['/blog/categorie', p.category_slug]">{{ p.category }}</a>
              }
            </nav>
            <h1>{{ p.title }}</h1>
            <p class="meta"><time [attr.datetime]="p.published_at">{{ p.published_at | frDate }}</time></p>
          </header>
          @if (p.cover_image) {
            <figure class="container narrow cover"><img [src]="p.cover_image" alt="" fetchpriority="high" /></figure>
          }
          <div class="container narrow">
            <app-rich-text [html]="p.body" />
          </div>
        </article>
        @if (p.newer || p.older) {
          <nav class="container narrow neighbours" aria-label="Autres articles">
            @if (p.older; as o) {
              <a class="older" [routerLink]="['/blog', o.slug]"><span>← Article précédent</span>{{ o.title }}</a>
            } @else {
              <span></span>
            }
            @if (p.newer; as n) {
              <a class="newer" [routerLink]="['/blog', n.slug]"><span>Article suivant →</span>{{ n.title }}</a>
            }
          </nav>
        }
      }
      @case ('loading') {
        <p class="container narrow pad muted">Chargement…</p>
      }
      @case ('missing') {
        <div class="container narrow pad">
          <h1>Article introuvable</h1>
          <p>Cet article n’existe pas ou plus. <a routerLink="/blog">Voir tous les articles</a>.</p>
        </div>
      }
      @default {
        <div class="container narrow pad">
          <h1>Un problème est survenu</h1>
          <p>L’article ne peut pas être affiché pour le moment. Réessayez dans quelques instants.</p>
        </div>
      }
    }
  `,
  styles: `
    .head { padding-top: clamp(32px, 5vw, 56px); }
    .crumbs { display: flex; gap: 8px; font-size: 14px; color: var(--muted); margin-bottom: 14px; }
    .crumbs a { color: var(--blue-600); }
    h1 { font-family: var(--serif); font-weight: 600; font-size: clamp(32px, 4.5vw, 50px); line-height: 1.08; color: var(--navy); margin: 0 0 10px; text-wrap: balance; }
    .meta { margin: 0 0 28px; color: var(--muted); }
    .cover { margin-top: 0; margin-bottom: 32px; }
    .cover img { width: 100%; max-height: 520px; object-fit: contain; border-radius: var(--radius); background: var(--blush); display: block; }
    .neighbours { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-top: 48px; }
    .neighbours a { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border: 1px solid var(--line); border-radius: var(--radius); text-decoration: none; color: var(--navy); font-family: var(--serif); font-size: 19px; font-weight: 600; line-height: 1.25; }
    .neighbours a:hover { border-color: var(--blue-600); }
    .neighbours span { font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--muted); }
    .newer { text-align: right; }
    .pad { padding-top: 64px; }
    @media (max-width: 640px) { .neighbours { grid-template-columns: 1fr; } .newer { text-align: left; } }
  `,
})
export class BlogPost {
  private readonly cms = inject(Cms);
  private readonly seo = inject(Seo);
  private readonly route = inject(ActivatedRoute);

  protected readonly result = toSignal(
    this.route.paramMap.pipe(switchMap((p) => loadable(this.cms.post(p.get('slug') ?? '')))),
    { requireSync: true },
  );
  protected readonly post = computed(() => {
    const r = this.result();
    return r.state === 'ready' ? r.value : null;
  });

  constructor() {
    effect(() => {
      const r = this.result();
      if (r.state === 'missing') this.seo.notFound();
      if (r.state === 'ready') {
        this.seo.set({ title: r.value.title, description: r.value.seo_description, image: r.value.cover_image, type: 'article' });
      }
    });
  }
}
