import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageSummary, SiteSettings } from '../cms/cms';
import { TelHrefPipe, bySection } from '../cms/format';
import { Consent } from '../privacy/consent';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, TelHrefPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let s = settings();
    <footer class="relative mt-[clamp(64px,9vw,120px)] overflow-hidden bg-primary text-primary-foreground/80">
      <span class="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-rose/20 blur-3xl" aria-hidden="true"></span>
      <span class="pointer-events-none absolute -bottom-32 right-0 size-96 rounded-full bg-blue-400/10 blur-3xl" aria-hidden="true"></span>

      <div class="container relative grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p class="font-serif text-3xl font-semibold text-primary-foreground">{{ siteName() }}</p>
          @if (s.footer_about) {
            <p class="mt-3 max-w-md text-[15px] leading-relaxed">{{ s.footer_about }}</p>
          }
          <div class="mt-5 flex gap-2">
            @if (s.facebook_url) {
              <a [href]="s.facebook_url" target="_blank" rel="noopener" class="social" aria-label="Facebook">
                <app-icon name="facebook" class="size-[18px]" />
              </a>
            }
            @if (s.instagram_url) {
              <a [href]="s.instagram_url" target="_blank" rel="noopener" class="social" aria-label="Instagram">
                <app-icon name="instagram" class="size-[18px]" />
              </a>
            }
            @if (s.review_url) {
              <a [href]="s.review_url" target="_blank" rel="noopener" class="social" aria-label="Laisser un avis Google">
                <app-icon name="star" class="size-[18px]" />
              </a>
            }
          </div>
        </div>

        <div>
          <h2 class="heading">Boutique</h2>
          <ul class="grid gap-2.5 text-[15px]">
            @if (s.address) {
              <li class="flex gap-2"><app-icon name="map-pin" class="mt-0.5 size-4 text-rose" /> {{ s.address }}</li>
            }
            @if (s.phone) {
              <li class="flex gap-2">
                <app-icon name="phone" class="mt-0.5 size-4 text-rose" />
                <a [href]="s.phone | telHref">{{ s.phone }}</a>
              </li>
            }
            <li class="flex gap-2">
              <app-icon name="clock" class="mt-0.5 size-4 text-rose" />
              <a routerLink="/contact">Heures d’ouverture</a>
            </li>
          </ul>
        </div>

        <div>
          <h2 class="heading">Explorer</h2>
          <ul class="grid gap-2.5 text-[15px]">
            @for (p of products(); track p.slug) {
              <li><a [routerLink]="['/page', p.slug]">{{ p.nav_label }}</a></li>
            }
            <li><a routerLink="/blog">Blogue</a></li>
            @for (p of otherPages(); track p.slug) {
              <li><a [routerLink]="['/page', p.slug]">{{ p.nav_label }}</a></li>
            }
          </ul>
        </div>
      </div>

      <div class="container relative flex flex-col gap-3 border-t border-primary-foreground/15 py-6 text-[13px] text-primary-foreground/60 sm:flex-row sm:items-center sm:justify-between">
        <p>© {{ year }} {{ siteName() }}</p>
        <ul class="flex flex-wrap gap-x-5 gap-y-2">
          @for (p of legalPages(); track p.slug) {
            <li><a [routerLink]="['/page', p.slug]">{{ p.nav_label }}</a></li>
          }
          @if (consent.needed()) {
            <li>
              <button type="button" class="cursor-pointer underline-offset-4 hover:text-primary-foreground hover:underline" (click)="consent.openPreferences()">
                Gérer les témoins
              </button>
            </li>
          }
        </ul>
      </div>
    </footer>
  `,
  styles: `
    a {
      color: inherit;
      text-decoration: none;
      transition: color 0.15s ease;
    }
    a:hover {
      color: var(--primary-foreground);
      text-decoration: underline;
      text-underline-offset: 4px;
    }
    .heading {
      margin: 0 0 14px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--rose);
    }
    .social {
      display: inline-grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 999px;
      border: 1px solid oklch(1 0 0 / 18%);
      transition: background-color 0.2s ease, transform 0.2s ease;
    }
    .social:hover {
      background: oklch(1 0 0 / 12%);
      transform: translateY(-2px);
      text-decoration: none;
    }
  `,
})
export class SiteFooter {
  readonly settings = input.required<SiteSettings>();
  readonly pages = input.required<PageSummary[]>();
  protected readonly consent = inject(Consent);
  protected readonly year = new Date().getFullYear();

  protected readonly siteName = computed(() => this.settings().site_name || 'Lingerie & Maillots Christine');
  protected readonly products = computed(() => bySection(this.pages(), 'produits'));
  /** Published pages outside the menu sections. */
  protected readonly otherPages = computed(() => this.pages().filter((p) => p.nav_section === ''));
  /** Privacy policy, terms, and any other page in the « legal » section — once published. */
  protected readonly legalPages = computed(() => {
    const s = this.settings();
    const pages = this.pages();
    const wanted = [s.privacy_page, s.terms_page].filter((slug): slug is string => !!slug);
    const picked = wanted.map((slug) => pages.find((p) => p.slug === slug)).filter((p): p is PageSummary => !!p);
    for (const p of bySection(pages, 'legal')) if (!picked.includes(p)) picked.push(p);
    return picked;
  });
}
