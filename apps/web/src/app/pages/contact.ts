import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Cms, SiteSettings } from '../cms/cms';
import { Seo } from '../shared/seo';
import { VisitInfo } from '../shared/visit-info';

@Component({
  selector: 'app-contact',
  imports: [VisitInfo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = settings();
    <header class="page-hero">
      <div class="container">
        <h1>Nous joindre</h1>
        <p class="lead">Passez nous voir en boutique : on prend vos mesures, on vous écoute et on vous guide vers les modèles qui vous conviennent. Pour un essayage post-opératoire, il est préférable de prendre rendez-vous.</p>
      </div>
    </header>
    <div class="container content">
      <app-visit-info [settings]="s" />
      @if (s.facebook_url || s.instagram_url || s.review_url) {
        <div class="links">
          @if (s.facebook_url) {
            <a class="button ghost" [href]="s.facebook_url" target="_blank" rel="noopener">Facebook</a>
          }
          @if (s.instagram_url) {
            <a class="button ghost" [href]="s.instagram_url" target="_blank" rel="noopener">Instagram</a>
          }
          @if (s.review_url) {
            <a class="button ghost" [href]="s.review_url" target="_blank" rel="noopener">Laisser un avis Google</a>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .page-hero { background: var(--blush); padding: clamp(40px, 6vw, 72px) 0; }
    h1 { font-family: var(--serif); font-weight: 600; font-size: clamp(36px, 5vw, 56px); line-height: 1.05; color: var(--navy); margin: 0 0 12px; }
    .lead { margin: 0; font-size: 18px; color: var(--text-soft); max-width: 40em; }
    .content { padding-top: 48px; }
    .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 40px; }
  `,
})
export class Contact {
  protected readonly settings = toSignal(inject(Cms).settings(), { initialValue: {} as SiteSettings });

  constructor() {
    inject(Seo).set({
      title: 'Nous joindre',
      description: 'Adresse, téléphone et heures d’ouverture de Lingerie & Maillots Christine à Saint-Jérôme.',
    });
  }
}
