import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { Cms, PostSummary } from '../cms/cms';
import { PostCard } from '../shared/post-card';
import { Seo } from '../shared/seo';

const PAGE_SIZE = 12;

/** /blog and /blog/categorie/:category */
@Component({
  selector: 'app-blog-list',
  imports: [RouterLink, PostCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-hero">
      <div class="container">
        <p class="eyebrow">Blogue</p>
        <h1>{{ currentCategory()?.name || 'Conseils et nouvelles' }}</h1>
        <p class="lead">Conseils d’ajustement, nouveautés en boutique et nouvelles de l’équipe.</p>
      </div>
    </header>

    <div class="container list">
      @if (categories().length > 1) {
        <nav class="filters" aria-label="Catégories">
          <a routerLink="/blog" [attr.aria-current]="!categorySlug() ? 'page' : null">Tous</a>
          @for (c of categories(); track c.slug) {
            <a [routerLink]="['/blog/categorie', c.slug]" [attr.aria-current]="c.slug === categorySlug() ? 'page' : null">{{ c.name }}</a>
          }
        </nav>
      }

      @switch (status()) {
        @case ('loading') {
          <p class="muted">Chargement…</p>
        }
        @case ('error') {
          <p class="muted">Les articles ne peuvent pas être affichés pour le moment. Réessayez dans quelques instants.</p>
        }
        @default {
          @if (posts().length) {
            <div class="grid">
              @for (p of posts(); track p.slug) {
                <app-post-card [post]="p" />
              }
            </div>
            @if (nextCursor()) {
              <div class="more">
                <button type="button" class="button ghost" (click)="loadMore()" [disabled]="loadingMore()">
                  {{ loadingMore() ? 'Chargement…' : 'Afficher plus d’articles' }}
                </button>
              </div>
            }
          } @else {
            <p class="muted">Aucun article pour le moment.</p>
          }
        }
      }
    </div>
  `,
  styles: `
    .page-hero { background: var(--blush); padding: clamp(40px, 6vw, 72px) 0; }
    .eyebrow { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue-600); font-weight: 600; }
    h1 { font-family: var(--serif); font-weight: 600; font-size: clamp(36px, 5vw, 56px); line-height: 1.05; color: var(--navy); margin: 0 0 12px; }
    .lead { margin: 0; font-size: 18px; color: var(--text-soft); }
    .list { padding-top: 40px; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
    .filters a { padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; color: var(--navy); font-size: 14px; }
    .filters a[aria-current] { background: var(--navy); color: #fff; border-color: var(--navy); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 24px; }
    .more { display: flex; justify-content: center; margin-top: 40px; }
  `,
})
export class BlogList {
  private readonly cms = inject(Cms);
  private readonly seo = inject(Seo);
  private readonly route = inject(ActivatedRoute);

  protected readonly categories = toSignal(this.cms.postCategories().pipe(catchError(() => of([]))), { initialValue: [] });
  protected readonly categorySlug = toSignal(this.route.paramMap.pipe(map((p) => p.get('category'))), { initialValue: null });
  protected readonly currentCategory = computed(() => this.categories().find((c) => c.slug === this.categorySlug()) ?? null);

  protected readonly posts = signal<PostSummary[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadingMore = signal(false);

  constructor() {
    this.route.paramMap
      .pipe(
        map((p) => p.get('category')),
        tap(() => this.status.set('loading')),
        switchMap((category) => this.cms.posts({ category, limit: PAGE_SIZE }).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        if (!page) {
          this.status.set('error');
          return;
        }
        this.posts.set(page.data);
        this.nextCursor.set(page.next_cursor);
        this.status.set('ready');
      });

    effect(() => {
      const c = this.currentCategory();
      this.seo.set({
        title: c ? `${c.name} · Blogue` : 'Blogue',
        description: 'Conseils d’ajustement de soutien-gorge, nouveautés et nouvelles de la boutique Lingerie & Maillots Christine à Saint-Jérôme.',
      });
    });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.cms.posts({ category: this.categorySlug(), limit: PAGE_SIZE, cursor }).subscribe({
      next: (page) => {
        this.posts.update((list) => [...list, ...page.data]);
        this.nextCursor.set(page.next_cursor);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }
}
