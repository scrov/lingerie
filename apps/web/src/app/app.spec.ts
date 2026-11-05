import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('builds the menu from CMS settings and pages', async () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne((r) => r.url.endsWith('/api/settings')).flush({ site_name: 'Lingerie & Maillots Christine', phone: '450-304-3555' });
    http.expectOne((r) => r.url.endsWith('/api/pages')).flush({
      data: [
        { slug: 'soutiens-gorge', title: 'Soutiens-gorge', nav_section: 'produits', nav_label: 'Soutiens-gorge', position: 1, hero_image: '', excerpt: '' },
        { slug: 'notre-equipe', title: 'Notre équipe', nav_section: 'equipe', nav_label: 'Notre équipe', position: 1, hero_image: '', excerpt: '' },
      ],
    });
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.brand')?.textContent).toContain('Lingerie & Maillots Christine');
    expect(el.querySelector('#menu-produits')?.textContent).toContain('Soutiens-gorge');
    expect(el.querySelector('#site-nav')?.textContent).toContain('Notre équipe');
    expect(el.querySelector('a.call')?.getAttribute('href')).toBe('tel:+14503043555');
    http.verify();
  });

  it('still renders when the CMS is unreachable', async () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/api/settings')).flush('down', { status: 503, statusText: 'Unavailable' });
    http.expectOne((r) => r.url.endsWith('/api/pages')).flush('down', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.brand')?.textContent).toContain('Lingerie & Maillots Christine');
    expect(el.querySelector('#menu-produits')).toBeNull();
  });
});
