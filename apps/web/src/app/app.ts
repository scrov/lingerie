import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Cms, SiteSettings } from './cms/cms';
import { TelHrefPipe, bySection } from './cms/format';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TelHrefPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly cms = inject(Cms);

  protected readonly settings = toSignal(this.cms.settings(), { initialValue: {} as SiteSettings });
  private readonly pages = toSignal(this.cms.pages(), { initialValue: [] });
  protected readonly siteName = computed(() => this.settings().site_name || 'Lingerie & Maillots Christine');
  protected readonly products = computed(() => bySection(this.pages(), 'produits'));
  protected readonly team = computed(() => bySection(this.pages(), 'equipe')[0] ?? null);
  /** Published pages outside the menu sections, linked from the footer. */
  protected readonly otherPages = computed(() => this.pages().filter((p) => p.nav_section === ''));
  protected readonly year = new Date().getFullYear();

  protected readonly menuOpen = signal(false);
  protected readonly productsOpen = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => {
        this.menuOpen.set(false);
        this.productsOpen.set(false);
      });
  }

  protected closeMenus(): void {
    this.menuOpen.set(false);
    this.productsOpen.set(false);
  }
}
