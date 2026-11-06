import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { Cms, PageSummary, SiteSettings } from './cms/cms';
import { SiteFooter } from './layout/site-footer';
import { SiteHeader } from './layout/site-header';
import { Consent } from './privacy/consent';
import { CookieBanner } from './privacy/cookie-banner';
import { Seo } from './shared/seo';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteHeader, SiteFooter, CookieBanner],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly cms = inject(Cms);

  protected readonly settings = toSignal(this.cms.settings(), { initialValue: {} as SiteSettings });
  protected readonly pages = toSignal(this.cms.pages(), { initialValue: [] as PageSummary[] });

  constructor() {
    // Starts consent handling (banner, Google Consent Mode, tags) in the browser.
    inject(Consent);

    const seo = inject(Seo);
    effect(() => seo.applySiteSettings(this.settings()));
  }
}
