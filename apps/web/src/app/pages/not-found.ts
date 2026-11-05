import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seo } from '../shared/seo';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container narrow pad">
      <h1>Page introuvable</h1>
      <p>Cette adresse n’existe pas ou plus. Essayez <a routerLink="/">l’accueil</a> ou <a routerLink="/blog">le blogue</a>.</p>
    </div>
  `,
  styles: `
    .pad { padding-top: 72px; }
    h1 { font-family: var(--serif); font-weight: 600; font-size: 48px; color: var(--navy); margin: 0 0 12px; }
  `,
})
export class NotFound {
  constructor() {
    inject(Seo).notFound();
  }
}
