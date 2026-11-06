import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { PageSummary, SiteSettings } from '../cms/cms';
import { TelHrefPipe, bySection } from '../cms/format';
import { Icon } from '../shared/icon';

/**
 * Site header. Desktop: links plus a « Produits » navigation menu (opens on hover or click) listing every published
 * product page with its picture. Below 1024px: a menu button opens a side sheet where « Produits » is an accordion.
 */
@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, TelHrefPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sticky top-0 z-40 block',
    '(document:keydown.escape)': 'onEscape()',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    @let s = settings();
    <header
      class="border-b border-border/70 bg-background/85 backdrop-blur-xl transition-shadow duration-300"
      [class.shadow-soft]="scrolled()"
    >
      <div class="container flex h-[76px] items-center gap-4">
        <a routerLink="/" class="brand flex shrink-0 items-center no-underline" [attr.aria-label]="siteName() + ', accueil'">
          @if (s.logo) {
            <img [src]="s.logo" [alt]="siteName()" width="160" height="64" class="h-12 w-auto sm:h-14" />
          } @else {
            <span class="font-serif text-2xl font-semibold text-primary">{{ siteName() }}</span>
          }
        </a>

        <nav aria-label="Navigation principale" class="hidden flex-1 items-center justify-center gap-1 lg:flex">
          <a routerLink="/" class="navlink" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Accueil</a>

          @if (products().length) {
            <div class="relative" (pointerenter)="hoverOpen($event)" (pointerleave)="hoverClose($event)">
              <button
                #productsTrigger
                type="button"
                class="navlink gap-1.5"
                [class.active]="productsOpen()"
                aria-haspopup="true"
                [attr.aria-expanded]="productsOpen()"
                aria-controls="menu-produits"
                (click)="toggleProducts()"
              >
                Produits
                <app-icon name="chevron-down" class="size-4 transition-transform duration-300" [class.rotate-180]="productsOpen()" />
              </button>

              <div
                id="menu-produits"
                [attr.data-state]="productsOpen() ? 'open' : 'closed'"
                [attr.inert]="productsOpen() ? null : ''"
                class="absolute left-1/2 top-full z-50 w-[min(780px,calc(100vw-2rem))] -translate-x-1/2 pt-3
                  origin-top transition-[opacity,translate,scale,visibility] duration-200 ease-out
                  data-[state=closed]:invisible data-[state=closed]:-translate-y-1 data-[state=closed]:scale-[.98] data-[state=closed]:opacity-0"
              >
                <div class="grid grid-cols-[230px_minmax(0,1fr)] gap-2 overflow-hidden rounded-2xl border bg-popover p-2 text-popover-foreground shadow-lift">
                  <a
                    routerLink="/contact"
                    class="group relative flex flex-col justify-end overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground no-underline"
                  >
                    <span
                      class="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-rose/30 blur-2xl transition-transform duration-700 group-hover:scale-125"
                      aria-hidden="true"
                    ></span>
                    <app-icon name="ruler" class="mb-auto size-7 text-rose" />
                    <span class="mt-10 font-serif text-2xl font-semibold leading-tight">Service-conseil et prise de mesures</span>
                    <span class="mt-2 text-sm text-primary-foreground/75">Une équipe formée et certifiée par Anita, dans le respect et la discrétion.</span>
                    <span class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
                      Nous rendre visite
                      <app-icon name="arrow-right" class="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </a>
                  <ul class="grid grid-cols-2 gap-1 p-1">
                    @for (p of products(); track p.slug; let i = $index) {
                      <li>
                        <a
                          [routerLink]="['/page', p.slug]"
                          routerLinkActive="bg-accent"
                          class="group flex items-start gap-3 rounded-xl p-2.5 text-foreground no-underline transition-colors hover:bg-accent focus-visible:bg-accent"
                        >
                          <span class="relative size-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                            @if (p.hero_image) {
                              <img
                                [src]="p.hero_image"
                                alt=""
                                loading="lazy"
                                class="size-full object-cover transition-transform duration-500 group-hover:scale-110"
                              />
                            } @else {
                              <span class="grid size-full place-items-center font-serif text-2xl font-semibold text-primary/60">{{ p.nav_label.charAt(0) }}</span>
                            }
                          </span>
                          <span class="min-w-0">
                            <span class="block font-medium text-primary">{{ p.nav_label }}</span>
                            @if (p.excerpt) {
                              <span class="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{{ p.excerpt }}</span>
                            }
                          </span>
                        </a>
                      </li>
                    }
                  </ul>
                </div>
              </div>
            </div>
          }

          @if (team(); as t) {
            <a [routerLink]="['/page', t.slug]" class="navlink" routerLinkActive="active">{{ t.nav_label }}</a>
          }
          <a routerLink="/blog" class="navlink" routerLinkActive="active">Blogue</a>
          <a routerLink="/contact" class="navlink" routerLinkActive="active">Contact</a>
        </nav>

        <div class="ml-auto flex items-center gap-2 lg:ml-0">
          @if (s.phone) {
            <a class="button sm call hidden sm:inline-flex" [href]="s.phone | telHref">
              <app-icon name="phone" class="size-4" />
              {{ s.phone }}
            </a>
          }
          <button
            type="button"
            class="inline-flex size-11 items-center justify-center rounded-full border bg-card text-primary shadow-sm transition-colors hover:bg-accent lg:hidden"
            aria-controls="menu-mobile"
            [attr.aria-expanded]="sheetOpen()"
            (click)="sheetOpen.set(true)"
          >
            <app-icon name="menu" class="size-5" />
            <span class="sr-only">Menu</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Mobile sheet -->
    <div
      id="menu-mobile"
      class="fixed inset-0 z-50 lg:hidden"
      [class.pointer-events-none]="!sheetOpen()"
      [attr.inert]="sheetOpen() ? null : ''"
      [attr.aria-hidden]="!sheetOpen()"
    >
      <button
        type="button"
        tabindex="-1"
        aria-label="Fermer le menu"
        class="absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300"
        [class.opacity-0]="!sheetOpen()"
        (click)="sheetOpen.set(false)"
      ></button>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        class="absolute inset-y-0 right-0 flex w-[min(88vw,380px)] flex-col bg-background shadow-lift transition-transform duration-300 ease-out"
        [class.translate-x-full]="!sheetOpen()"
      >
        <div class="flex h-[76px] items-center justify-between border-b px-5">
          <span class="font-serif text-xl font-semibold text-primary">{{ siteName() }}</span>
          <button
            #sheetClose
            type="button"
            class="inline-flex size-10 items-center justify-center rounded-full text-primary hover:bg-accent"
            (click)="sheetOpen.set(false)"
          >
            <app-icon name="x" class="size-5" />
            <span class="sr-only">Fermer le menu</span>
          </button>
        </div>
        <nav aria-label="Navigation principale" class="flex-1 overflow-y-auto px-3 py-4">
          <a routerLink="/" class="sheet-link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Accueil</a>
          @if (products().length) {
            <button
              type="button"
              class="sheet-link w-full justify-between"
              [attr.aria-expanded]="mobileProductsOpen()"
              aria-controls="menu-produits-mobile"
              (click)="mobileProductsOpen.set(!mobileProductsOpen())"
            >
              Produits
              <app-icon name="chevron-down" class="size-5 transition-transform duration-300" [class.rotate-180]="mobileProductsOpen()" />
            </button>
            <div
              id="menu-produits-mobile"
              class="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out data-[state=open]:grid-rows-[1fr]"
              [attr.data-state]="mobileProductsOpen() ? 'open' : 'closed'"
            >
              <ul class="overflow-hidden" [attr.inert]="mobileProductsOpen() ? null : ''">
                @for (p of products(); track p.slug) {
                  <li>
                    <a
                      [routerLink]="['/page', p.slug]"
                      routerLinkActive="bg-accent"
                      class="ml-2 flex items-center gap-3 rounded-xl px-3 py-2 text-foreground no-underline hover:bg-accent"
                    >
                      <span class="size-10 shrink-0 overflow-hidden rounded-lg bg-secondary">
                        @if (p.hero_image) {
                          <img [src]="p.hero_image" alt="" loading="lazy" class="size-full object-cover" />
                        } @else {
                          <span class="grid size-full place-items-center font-serif text-lg font-semibold text-primary/60">{{ p.nav_label.charAt(0) }}</span>
                        }
                      </span>
                      {{ p.nav_label }}
                    </a>
                  </li>
                }
              </ul>
            </div>
          }
          @if (team(); as t) {
            <a [routerLink]="['/page', t.slug]" class="sheet-link" routerLinkActive="active">{{ t.nav_label }}</a>
          }
          <a routerLink="/blog" class="sheet-link" routerLinkActive="active">Blogue</a>
          <a routerLink="/contact" class="sheet-link" routerLinkActive="active">Contact</a>
        </nav>
        @if (s.phone || s.address) {
          <div class="border-t p-5">
            @if (s.phone) {
              <a class="button w-full" [href]="s.phone | telHref">
                <app-icon name="phone" class="size-4" />
                {{ s.phone }}
              </a>
            }
            @if (s.address) {
              <p class="mt-3 flex gap-2 text-sm text-muted-foreground">
                <app-icon name="map-pin" class="mt-0.5 size-4" />
                {{ s.address }}
              </p>
            }
          </div>
        }
      </aside>
    </div>
  `,
  styles: `
    .navlink {
      display: inline-flex;
      align-items: center;
      height: 40px;
      padding: 0 14px;
      border-radius: 999px;
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      color: var(--foreground);
      background: transparent;
      border: 0;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .navlink:hover,
    .navlink.active {
      background: var(--accent);
      color: var(--primary);
    }
    .sheet-link {
      display: flex;
      align-items: center;
      padding: 12px 14px;
      border-radius: 14px;
      font: inherit;
      font-size: 17px;
      font-weight: 500;
      color: var(--foreground);
      background: transparent;
      border: 0;
      cursor: pointer;
      text-decoration: none;
    }
    .sheet-link:hover,
    .sheet-link.active {
      background: var(--accent);
      color: var(--primary);
    }
  `,
})
export class SiteHeader {
  readonly settings = input.required<SiteSettings>();
  readonly pages = input.required<PageSummary[]>();

  protected readonly siteName = computed(() => this.settings().site_name || 'Lingerie & Maillots Christine');
  protected readonly products = computed(() => bySection(this.pages(), 'produits'));
  protected readonly team = computed(() => bySection(this.pages(), 'equipe')[0] ?? null);

  protected readonly productsOpen = signal(false);
  protected readonly sheetOpen = signal(false);
  protected readonly mobileProductsOpen = signal(false);
  protected readonly scrolled = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly productsTrigger = viewChild<ElementRef<HTMLButtonElement>>('productsTrigger');
  private readonly sheetClose = viewChild<ElementRef<HTMLButtonElement>>('sheetClose');
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const destroyRef = inject(DestroyRef);

    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeAll());

    // Scroll lock and focus while the mobile sheet is open.
    effect(() => {
      const open = this.sheetOpen();
      if (!this.browser) return;
      this.document.body.style.overflow = open ? 'hidden' : '';
      if (open) setTimeout(() => this.sheetClose()?.nativeElement.focus(), 50);
    });

    afterNextRender(() => {
      const w = this.document.defaultView;
      if (!w) return;
      const onScroll = () => this.scrolled.set(w.scrollY > 8);
      onScroll();
      w.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        w.removeEventListener('scroll', onScroll);
        clearTimeout(this.hoverTimer);
        this.document.body.style.overflow = '';
      });
    });
  }

  protected toggleProducts(): void {
    clearTimeout(this.hoverTimer);
    this.productsOpen.update((open) => !open);
  }

  /** Mouse only: touch screens get a tap on the button instead. */
  protected hoverOpen(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => this.productsOpen.set(true), 90);
  }

  protected hoverClose(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => this.productsOpen.set(false), 200);
  }

  protected onEscape(): void {
    if (this.productsOpen()) {
      this.productsOpen.set(false);
      this.productsTrigger()?.nativeElement.focus();
    }
    this.sheetOpen.set(false);
  }

  protected onDocumentClick(e: MouseEvent): void {
    if (this.productsOpen() && !this.host.contains(e.target as Node)) this.productsOpen.set(false);
  }

  private closeAll(): void {
    clearTimeout(this.hoverTimer);
    this.productsOpen.set(false);
    this.sheetOpen.set(false);
    this.mobileProductsOpen.set(false);
  }
}
