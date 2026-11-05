import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SiteSettings } from '../cms/cms';
import { TelHrefPipe } from '../cms/format';

/** Address, phone, opening hours and links — on the home page and the contact page. */
@Component({
  selector: 'app-visit-info',
  imports: [TelHrefPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = settings();
    <div class="visit-grid">
      <div class="block">
        <h3>Adresse</h3>
        @if (s.address) {
          <p>{{ s.address }}</p>
        }
        @if (s.map_url) {
          <p><a [href]="s.map_url" target="_blank" rel="noopener">Itinéraire dans Google Maps</a></p>
        }
        @if (s.phone) {
          <h3>Téléphone</h3>
          <p><a class="phone" [href]="s.phone | telHref">{{ s.phone }}</a></p>
        }
        @if (s.email) {
          <h3>Courriel</h3>
          <p><a [href]="'mailto:' + s.email">{{ s.email }}</a></p>
        }
      </div>
      @if (s.hours?.length) {
        <div class="block">
          <h3>Heures d’ouverture</h3>
          <dl class="hours">
            @for (row of s.hours; track $index) {
              <div [class.closed]="row.hours.toLowerCase().startsWith('ferm')">
                <dt>{{ row.days }}</dt>
                <dd>{{ row.hours }}</dd>
              </div>
            }
          </dl>
        </div>
      }
    </div>
  `,
  styles: `
    .visit-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 32px; }
    h3 { margin: 0 0 6px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    h3:not(:first-child) { margin-top: 22px; }
    p { margin: 0 0 4px; }
    .phone { font-family: var(--serif); font-size: 28px; font-weight: 600; text-decoration: none; color: var(--navy); }
    .hours { margin: 0; display: grid; gap: 2px; }
    .hours div { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px solid var(--line); }
    dt { font-weight: 500; }
    dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
    .closed { color: var(--muted); }
  `,
})
export class VisitInfo {
  readonly settings = input.required<SiteSettings>();
}
