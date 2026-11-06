import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageSummary, SiteSettings } from '../cms/cms';
import { Icon } from '../shared/icon';
import { Consent } from './consent';

/**
 * Cookie consent banner and preferences dialog. Rendered only in the browser, after hydration, so server HTML
 * stays the same for everyone. Texts come from the CMS (admin › Confidentialité).
 */
@Component({
  selector: 'app-cookie-banner',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ready()) {
      @if (consent.bannerOpen() && !consent.preferencesOpen()) {
        <section
          role="region"
          aria-labelledby="consent-title"
          class="fixed inset-x-3 bottom-3 z-[60] animate-fade-up rounded-2xl border bg-card/95 p-5 text-card-foreground shadow-lift backdrop-blur-xl sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[420px]"
        >
          <div class="flex items-start gap-3.5">
            <span class="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-primary">
              <app-icon name="cookie" class="size-5" />
            </span>
            <div class="min-w-0">
              <h2 id="consent-title" class="font-serif text-[22px] font-semibold leading-tight text-primary">{{ t().title }}</h2>
              <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {{ t().message }}
                @if (privacyPage(); as p) {
                  <a [routerLink]="['/page', p.slug]" class="font-medium text-primary underline underline-offset-4">En savoir plus</a>
                }
              </p>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-2">
            <button type="button" class="button outline sm" (click)="consent.rejectAll()">{{ t().reject }}</button>
            <button type="button" class="button sm" (click)="consent.acceptAll()">{{ t().accept }}</button>
          </div>
          <button
            type="button"
            class="mt-3 w-full cursor-pointer text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            (click)="consent.openPreferences()"
          >
            {{ t().customize }}
          </button>
        </section>
      }

      <dialog
        #prefs
        class="animated m-auto w-[min(520px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border bg-card p-0 text-card-foreground shadow-lift"
        aria-labelledby="prefs-title"
        (close)="consent.preferencesOpen.set(false)"
      >
        <div class="p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 id="prefs-title" class="font-serif text-2xl font-semibold text-primary">{{ t().title }}</h2>
              <p class="mt-1 text-sm text-muted-foreground">Choisissez les témoins que vous acceptez. Vous pourrez changer d’avis en tout temps.</p>
            </div>
            <button
              type="button"
              class="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-primary"
              (click)="prefs.close()"
            >
              <app-icon name="x" class="size-5" />
              <span class="sr-only">Fermer</span>
            </button>
          </div>

          <ul class="mt-5 divide-y rounded-xl border">
            <li class="flex items-start justify-between gap-4 p-4">
              <div>
                <p class="font-medium">Nécessaires</p>
                <p class="mt-0.5 text-sm text-muted-foreground">Mémorisent votre choix sur cette page. Toujours actifs.</p>
              </div>
              <span class="switch" data-state="checked" aria-hidden="true"><span></span></span>
            </li>
            @if (consent.tools().ga4 || consent.tools().gtm) {
              <li class="flex items-start justify-between gap-4 p-4">
                <div>
                  <p class="font-medium" id="consent-analytics">{{ t().analyticsLabel }}</p>
                  <p class="mt-0.5 text-sm text-muted-foreground">{{ t().analyticsText }}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  aria-labelledby="consent-analytics"
                  [attr.aria-checked]="analytics()"
                  [attr.data-state]="analytics() ? 'checked' : 'unchecked'"
                  (click)="analytics.set(!analytics())"
                >
                  <span></span>
                </button>
              </li>
            }
            @if (consent.tools().ads || consent.tools().pixel || consent.tools().gtm) {
              <li class="flex items-start justify-between gap-4 p-4">
                <div>
                  <p class="font-medium" id="consent-marketing">{{ t().marketingLabel }}</p>
                  <p class="mt-0.5 text-sm text-muted-foreground">{{ t().marketingText }}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  aria-labelledby="consent-marketing"
                  [attr.aria-checked]="marketing()"
                  [attr.data-state]="marketing() ? 'checked' : 'unchecked'"
                  (click)="marketing.set(!marketing())"
                >
                  <span></span>
                </button>
              </li>
            }
          </ul>

          @if (privacyPage(); as p) {
            <p class="mt-4 text-sm">
              <a [routerLink]="['/page', p.slug]" class="font-medium text-primary underline underline-offset-4" (click)="prefs.close()">{{ p.title }}</a>
            </p>
          }

          <div class="mt-6 grid gap-2 sm:grid-cols-3">
            <button type="button" class="button outline sm" (click)="consent.rejectAll()">{{ t().reject }}</button>
            <button type="button" class="button secondary sm" (click)="consent.save({ analytics: analytics(), marketing: marketing() })">
              {{ t().save }}
            </button>
            <button type="button" class="button sm" (click)="consent.acceptAll()">{{ t().accept }}</button>
          </div>
        </div>
      </dialog>
    }
  `,
  styles: `
    dialog::backdrop {
      background: oklch(0.2 0.03 271 / 55%);
    }
    .switch {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      width: 44px;
      height: 24px;
      padding: 2px;
      border-radius: 999px;
      border: 0;
      background: var(--input);
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    .switch[data-state='checked'] {
      background: var(--primary);
    }
    span.switch {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .switch > span {
      display: block;
      width: 20px;
      height: 20px;
      border-radius: 999px;
      background: #fff;
      box-shadow: 0 1px 3px oklch(0 0 0 / 25%);
      transition: transform 0.2s ease;
    }
    .switch[data-state='checked'] > span {
      transform: translateX(20px);
    }
  `,
})
export class CookieBanner {
  readonly settings = input.required<SiteSettings>();
  readonly pages = input.required<PageSummary[]>();
  protected readonly consent = inject(Consent);

  protected readonly ready = signal(false);
  protected readonly analytics = signal(false);
  protected readonly marketing = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('prefs');

  protected readonly t = computed(() => {
    const s = this.settings();
    return {
      title: s.consent_title || 'Votre vie privée',
      message:
        s.consent_message ||
        'Nous utilisons des témoins (cookies) pour mesurer l’audience du site et l’efficacité de nos publicités, seulement avec votre accord.',
      accept: s.consent_accept_label || 'Tout accepter',
      reject: s.consent_reject_label || 'Tout refuser',
      customize: s.consent_customize_label || 'Personnaliser',
      save: s.consent_save_label || 'Enregistrer mes choix',
      analyticsLabel: s.consent_analytics_label || 'Mesure d’audience',
      analyticsText: s.consent_analytics_text || '',
      marketingLabel: s.consent_marketing_label || 'Marketing',
      marketingText: s.consent_marketing_text || '',
    };
  });

  /** The privacy policy chosen in the CMS, if it is published. */
  protected readonly privacyPage = computed(() => {
    const slug = this.settings().privacy_page;
    return slug ? (this.pages().find((p) => p.slug === slug) ?? null) : null;
  });

  constructor() {
    afterNextRender(() => this.ready.set(true));

    // Open/close the native dialog with the service state; start from the current choice.
    effect(() => {
      const open = this.consent.preferencesOpen();
      const el = this.dialog()?.nativeElement;
      if (!el) return;
      if (open && !el.open) {
        const c = untracked(() => this.consent.choice());
        this.analytics.set(c?.analytics ?? false);
        this.marketing.set(c?.marketing ?? false);
        el.showModal();
      } else if (!open && el.open) {
        el.close();
      }
    });
  }
}
