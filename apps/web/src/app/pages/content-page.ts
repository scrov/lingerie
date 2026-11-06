import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { Cms, SiteSettings, loadable } from '../cms/cms';
import { TelHrefPipe, bySection } from '../cms/format';
import { Icon } from '../shared/icon';
import { Reveal } from '../shared/reveal';
import { RichText } from '../shared/rich-text';
import { Seo } from '../shared/seo';

/** A CMS page at /page/:slug — product categories, the team page, legal pages, etc. */
@Component({
  selector: 'app-content-page',
  imports: [RouterLink, TelHrefPipe, Icon, Reveal, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (result().state) {
      @case ('ready') {
        @let p = page()!;
        @let s = settings();
        <header class="relative isolate overflow-hidden bg-gradient-to-b from-background to-secondary">
          <span class="pointer-events-none absolute -left-32 -top-24 -z-10 size-96 rounded-full bg-rose/30 blur-3xl" aria-hidden="true"></span>
          <div
            class="container grid items-center gap-10 py-12 sm:py-16 lg:data-[image]:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]"
            [attr.data-image]="p.hero_image ? '' : null"
          >
            <div class="animate-fade-up">
              @if (isProduct()) {
                <p class="eyebrow"><span class="h-px w-8 bg-rose-strong" aria-hidden="true"></span>Nos produits</p>
              }
              <h1 class="mt-4 text-balance font-serif text-[clamp(38px,5.2vw,64px)] font-semibold leading-[1.02] tracking-tight text-primary">{{ p.title }}</h1>
              @if (p.excerpt) {
                <p class="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">{{ p.excerpt }}</p>
              }
            </div>
            @if (p.hero_image) {
              <div class="relative mx-auto w-full max-w-[380px] animate-fade-up [animation-delay:120ms]">
                <div class="aspect-[4/5] overflow-hidden rounded-[2rem] bg-secondary shadow-lift ring-1 ring-primary/10">
                  <img [src]="p.hero_image" alt="" class="size-full animate-kenburns object-cover object-[center_25%]" />
                </div>
              </div>
            }
          </div>
        </header>

        @if (hasBody()) {
          <article class="container narrow pt-12">
            <app-rich-text [html]="p.body" />
          </article>
        }

        @if (isProduct()) {
          <div class="container narrow pt-10">
            <div class="relative overflow-hidden rounded-2xl bg-primary p-7 text-primary-foreground shadow-soft sm:p-9" appReveal>
              <span class="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-rose/25 blur-3xl" aria-hidden="true"></span>
              <app-icon name="ruler" class="relative size-8 text-rose" />
              <p class="relative mt-4 font-serif text-[28px] font-semibold leading-tight">Venez essayer en boutique</p>
              <p class="relative mt-2 max-w-lg text-primary-foreground/75">
                On prend vos mesures et on vous guide vers les modèles qui vous conviennent, dans le respect et la discrétion.
              </p>
              <div class="relative mt-6 flex flex-wrap gap-3">
                @if (s.phone) {
                  <a class="button secondary" [href]="s.phone | telHref">
                    <app-icon name="phone" class="size-4" />
                    {{ s.phone }}
                  </a>
                }
                <a class="button border-white/25 bg-transparent text-white shadow-none hover:bg-white/10" routerLink="/contact">
                  <app-icon name="clock" class="size-4" />
                  Heures d’ouverture
                </a>
              </div>
            </div>
          </div>
        }

        @if (others().length) {
          <nav class="container pt-[clamp(48px,7vw,88px)]" aria-labelledby="autres">
            <h2 id="autres" class="section-title" appReveal>{{ isProduct() ? 'Nos autres produits' : 'Dans la même section' }}</h2>
            <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              @for (o of others(); track o.slug; let i = $index) {
                <li appReveal [revealDelay]="i * 70">
                  <a [routerLink]="['/page', o.slug]" class="group block no-underline">
                    <span class="relative block aspect-[4/5] overflow-hidden rounded-xl bg-secondary shadow-soft">
                      @if (o.hero_image) {
                        <img [src]="o.hero_image" alt="" loading="lazy" class="size-full object-cover object-[center_25%] transition-transform duration-700 group-hover:scale-110" />
                      } @else {
                        <span class="grid size-full place-items-center bg-gradient-to-br from-accent to-secondary font-serif text-5xl font-semibold text-primary/40">{{ o.nav_label.charAt(0) }}</span>
                      }
                    </span>
                    <span class="mt-2 block font-medium text-primary group-hover:underline">{{ o.nav_label }}</span>
                  </a>
                </li>
              }
            </ul>
          </nav>
        }
      }
      @case ('loading') {
        <p class="container narrow pt-16 muted">Chargement…</p>
      }
      @case ('missing') {
        <div class="container narrow pt-16">
          <h1 class="section-title">Page introuvable</h1>
          <p>Cette page n’existe pas ou plus. <a routerLink="/">Retour à l’accueil</a>.</p>
        </div>
      }
      @default {
        <div class="container narrow pt-16">
          <h1 class="section-title">Un problème est survenu</h1>
          <p>La page ne peut pas être affichée pour le moment. Réessayez dans quelques instants.</p>
        </div>
      }
    }
  `,
})
export class ContentPage {
  private readonly cms = inject(Cms);
  private readonly seo = inject(Seo);
  private readonly route = inject(ActivatedRoute);

  protected readonly settings = toSignal(this.cms.settings(), { initialValue: {} as SiteSettings });
  protected readonly result = toSignal(
    this.route.paramMap.pipe(switchMap((p) => loadable(this.cms.page(p.get('slug') ?? '')))),
    { requireSync: true },
  );
  protected readonly page = computed(() => {
    const r = this.result();
    return r.state === 'ready' ? r.value : null;
  });
  protected readonly isProduct = computed(() => this.page()?.nav_section === 'produits');
  protected readonly hasBody = computed(() => (this.page()?.body ?? '').replace(/<[^>]*>|&nbsp;|\s/g, '') !== '');

  private readonly allPages = toSignal(this.cms.pages(), { initialValue: [] });
  /** The other pages of the same menu section. */
  protected readonly others = computed(() => {
    const p = this.page();
    return p?.nav_section && p.nav_section !== 'legal' ? bySection(this.allPages(), p.nav_section).filter((o) => o.slug !== p.slug) : [];
  });

  constructor() {
    effect(() => {
      const r = this.result();
      if (r.state === 'missing') this.seo.notFound();
      if (r.state === 'ready') this.seo.set({ title: r.value.title, description: r.value.seo_description, image: r.value.hero_image });
    });
  }
}
