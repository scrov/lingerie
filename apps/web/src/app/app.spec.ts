import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

const PAGES = [
  { slug: 'soutiens-gorge', title: 'Soutiens-gorge', nav_section: 'produits', nav_label: 'Soutiens-gorge', position: 1, hero_image: '/uploads/a.png', excerpt: 'Avec ou sans armature.' },
  { slug: 'maillots', title: 'Maillots de bain', nav_section: 'produits', nav_label: 'Maillots de bain', position: 2, hero_image: '', excerpt: '' },
  { slug: 'notre-equipe', title: 'Notre équipe', nav_section: 'equipe', nav_label: 'Notre équipe', position: 1, hero_image: '', excerpt: '' },
  { slug: 'politique-de-confidentialite', title: 'Politique de confidentialité', nav_section: 'legal', nav_label: 'Confidentialité', position: 1, hero_image: '', excerpt: '' },
];

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  async function render(settings: Record<string, unknown> | null, pages: unknown[] | null = PAGES) {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const s = http.expectOne((r) => r.url.endsWith('/api/settings'));
    if (settings) s.flush(settings);
    else s.flush('down', { status: 503, statusText: 'Unavailable' });
    const p = http.expectOne((r) => r.url.endsWith('/api/pages'));
    if (pages) p.flush({ data: pages });
    else p.flush('down', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    await fixture.whenStable();
    http.verify();
    const el = fixture.nativeElement as HTMLElement;
    return Object.assign(el, { settle: () => fixture.whenStable() });
  }

  it('builds the header and its Produits menu from CMS settings and pages', async () => {
    const el = await render({ site_name: 'Lingerie & Maillots Christine', phone: '450-304-3555' });
    expect(el.querySelector('.brand')?.textContent).toContain('Lingerie & Maillots Christine');
    const menu = el.querySelector('#menu-produits');
    expect(menu?.textContent).toContain('Soutiens-gorge');
    expect(menu?.textContent).toContain('Avec ou sans armature.');
    expect(menu?.getAttribute('data-state')).toBe('closed');
    expect(el.querySelector('nav[aria-label="Navigation principale"]')?.textContent).toContain('Notre équipe');
    expect(el.querySelector('a.call')?.getAttribute('href')).toBe('tel:+14503043555');
  });

  it('opens the Produits menu on click', async () => {
    const el = await render({});
    const trigger = el.querySelector<HTMLButtonElement>('button[aria-controls="menu-produits"]')!;
    trigger.click();
    await el.settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#menu-produits')?.getAttribute('data-state')).toBe('open');
  });

  it('links published legal pages in the footer', async () => {
    const el = await render({ privacy_page: 'politique-de-confidentialite', terms_page: 'conditions-d-utilisation' });
    const footer = el.querySelector('footer')!;
    expect(footer.textContent).toContain('Confidentialité');
    // The terms page isn't in the published list, so it isn't linked.
    expect(footer.querySelector('a[href="/page/conditions-d-utilisation"]')).toBeNull();
  });

  it('still renders when the CMS is unreachable', async () => {
    const el = await render(null, null);
    expect(el.querySelector('.brand')?.textContent).toContain('Lingerie & Maillots Christine');
    expect(el.querySelector('#menu-produits')).toBeNull();
  });

  it('shows no consent banner and loads nothing without a tracking tool', async () => {
    const el = await render({ consent_enabled: true });
    expect(el.querySelector('[aria-labelledby="consent-title"]')).toBeNull();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it('asks for consent before loading Google Analytics', async () => {
    const el = await render({ consent_enabled: true, consent_version: 3, ga4_id: 'G-TEST1234' });
    const banner = el.querySelector('[aria-labelledby="consent-title"]');
    expect(banner).not.toBeNull();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();

    const accept = [...banner!.querySelectorAll('button')].find((b) => b.textContent?.includes('Tout accepter'))!;
    accept.click();
    await el.settle();

    expect(document.head.querySelector('script[src="https://www.googletagmanager.com/gtag/js?id=G-TEST1234"]')).not.toBeNull();
    const stored = JSON.parse(localStorage.getItem('lmc-consent') ?? '{}');
    expect(stored).toMatchObject({ v: 3, analytics: true, marketing: true });
  });

  it('ignores a tracking ID in the wrong format', async () => {
    const el = await render({ ga4_id: 'G-"><script>' });
    expect(el.querySelector('[aria-labelledby="consent-title"]')).toBeNull();
  });
});
