import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, skip } from 'rxjs';
import { Cms, SiteSettings } from '../cms/cms';

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
}

interface StoredConsent extends ConsentChoice {
  v: number;
  at: string;
}

type Gtag = (...args: unknown[]) => void;
interface Fbq {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
}
interface TrackingWindow extends Window {
  dataLayer?: unknown[];
  gtag?: Gtag;
  fbq?: Fbq;
  _fbq?: Fbq;
}

const STORAGE_KEY = 'lmc-consent';

/** Same formats the CMS enforces. Checked again here because these values end up in script URLs. */
const FORMATS = {
  ga4: /^G-[A-Z0-9]{4,20}$/,
  ads: /^AW-\d{6,15}$/,
  gtm: /^GTM-[A-Z0-9]{4,12}$/,
  pixel: /^\d{8,20}$/,
};

export interface Tools {
  ga4: string;
  ads: string;
  gtm: string;
  pixel: string;
}

export function configuredTools(s: SiteSettings): Tools {
  const pick = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : '');
  return {
    ga4: pick(s.ga4_id, FORMATS.ga4),
    ads: pick(s.google_ads_id, FORMATS.ads),
    gtm: pick(s.gtm_id, FORMATS.gtm),
    pixel: pick(s.meta_pixel_id, FORMATS.pixel),
  };
}

/**
 * Cookie consent and the measurement/advertising tools that depend on it.
 *
 * Nothing is loaded until the visitor agrees (opt-in, as Quebec's Law 25 expects). Google tags get Consent Mode v2
 * with everything denied by default, then updated from the visitor's choice. The choice is stored in this browser
 * only, and asked again when the editor raises the consent version in the CMS.
 */
@Injectable({ providedIn: 'root' })
export class Consent {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly settings = toSignal(inject(Cms).settings(), { initialValue: {} as SiteSettings });

  readonly tools = computed(() => configuredTools(this.settings()));
  /** A tool is configured and the banner is enabled: visitors are asked. */
  readonly needed = computed(() => {
    const t = this.tools();
    return this.settings().consent_enabled !== false && !!(t.ga4 || t.ads || t.gtm || t.pixel);
  });
  readonly version = computed(() => {
    const v = Number(this.settings().consent_version);
    return Number.isSafeInteger(v) && v > 0 ? v : 1;
  });

  /** The visitor's current choice, or null if they haven't answered (this version). */
  readonly choice = signal<ConsentChoice | null>(null);
  readonly bannerOpen = signal(false);
  readonly preferencesOpen = signal(false);

  private readonly loaded = new Set<string>();

  constructor() {
    if (!this.browser) return;

    // Runs once the CMS settings are in (and again only if they change).
    effect(() => {
      const needed = this.needed();
      const version = this.version();
      untracked(() => {
        if (!needed) {
          this.bannerOpen.set(false);
          return;
        }
        const stored = this.read();
        if (stored && stored.v === version) {
          this.choice.set({ analytics: stored.analytics, marketing: stored.marketing });
          this.apply();
        } else {
          this.choice.set(null);
          this.bannerOpen.set(true);
        }
      });
    });

    // The Meta pixel doesn't see Angular's client-side navigations by itself.
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        if (this.loaded.has('pixel')) this.window?.fbq?.('track', 'PageView');
      });
  }

  acceptAll(): void {
    this.save({ analytics: true, marketing: true });
  }

  rejectAll(): void {
    this.save({ analytics: false, marketing: false });
  }

  save(choice: ConsentChoice): void {
    const stored: StoredConsent = { ...choice, v: this.version(), at: new Date().toISOString() };
    try {
      this.window?.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Storage blocked: the choice holds for this visit only.
    }
    this.choice.set({ ...choice });
    this.bannerOpen.set(false);
    this.preferencesOpen.set(false);
    this.apply();
  }

  openPreferences(): void {
    this.preferencesOpen.set(true);
  }

  private get window(): TrackingWindow | null {
    return this.browser ? (this.document.defaultView as TrackingWindow | null) : null;
  }

  private read(): StoredConsent | null {
    try {
      const raw = this.window?.localStorage.getItem(STORAGE_KEY);
      const v = raw ? (JSON.parse(raw) as Partial<StoredConsent>) : null;
      if (!v || typeof v.v !== 'number' || typeof v.analytics !== 'boolean' || typeof v.marketing !== 'boolean') return null;
      return { v: v.v, analytics: v.analytics, marketing: v.marketing, at: String(v.at ?? '') };
    } catch {
      return null;
    }
  }

  /** Pushes the visitor's choice to Google's consent state and loads whatever it now allows. */
  private apply(): void {
    const w = this.window;
    const c = this.choice();
    if (!w || !c || !this.needed()) return;
    const t = this.tools();

    const gtag = this.gtag(w);
    gtag('consent', 'update', {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: c.marketing ? 'granted' : 'denied',
      ad_user_data: c.marketing ? 'granted' : 'denied',
      ad_personalization: c.marketing ? 'granted' : 'denied',
    });

    const gtagIds = [c.analytics ? t.ga4 : '', c.marketing ? t.ads : ''].filter(Boolean);
    if (gtagIds.length && !this.loaded.has('gtag')) {
      this.loaded.add('gtag');
      this.script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gtagIds[0]!)}`);
      gtag('js', new Date());
    }
    for (const id of gtagIds) {
      if (this.loaded.has(id)) continue;
      this.loaded.add(id);
      gtag('config', id);
    }

    if (t.gtm && (c.analytics || c.marketing) && !this.loaded.has(t.gtm)) {
      this.loaded.add(t.gtm);
      w.dataLayer!.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      this.script(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(t.gtm)}`);
    }

    if (t.pixel) {
      if (c.marketing) this.pixel(w, t.pixel);
      else if (w.fbq) w.fbq('consent', 'revoke');
    }
  }

  /** dataLayer + gtag(), with everything denied until the visitor decides. */
  private gtag(w: TrackingWindow): Gtag {
    const layer: unknown[] = (w.dataLayer ??= []);
    if (!w.gtag) {
      // gtag.js expects the Arguments object itself, not an array.
      w.gtag = function () {
        // eslint-disable-next-line prefer-rest-params
        layer.push(arguments);
      };
      w.gtag('consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        wait_for_update: 500,
      });
    }
    return w.gtag;
  }

  /** Meta's standard pixel bootstrap, written out instead of pasted. */
  private pixel(w: TrackingWindow, id: string): void {
    if (!w.fbq) {
      const fbq = function () {
        // eslint-disable-next-line prefer-rest-params
        const args = arguments;
        if (fbq.callMethod) fbq.callMethod(...Array.from(args));
        else fbq.queue.push(args);
      } as unknown as Fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      w.fbq = fbq;
      w._fbq = fbq;
      this.script('https://connect.facebook.net/en_US/fbevents.js');
    }
    w.fbq('consent', 'grant');
    if (!this.loaded.has('pixel')) {
      this.loaded.add('pixel');
      w.fbq('init', id);
      w.fbq('track', 'PageView');
    }
  }

  private script(src: string): void {
    const s = this.document.createElement('script');
    s.async = true;
    s.src = src;
    this.document.head.appendChild(s);
  }
}
