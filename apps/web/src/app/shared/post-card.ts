import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostSummary } from '../cms/cms';
import { FrDatePipe } from '../cms/format';

@Component({
  selector: 'app-post-card',
  imports: [RouterLink, FrDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = post();
    <a class="card" [routerLink]="['/blog', p.slug]">
      <div class="media">
        @if (p.cover_image) {
          <img [src]="p.cover_image" alt="" loading="lazy" />
        } @else {
          <div class="placeholder" aria-hidden="true"><span>{{ p.title.charAt(0) }}</span></div>
        }
      </div>
      <div class="body">
        <p class="meta"><time [attr.datetime]="p.published_at">{{ p.published_at | frDate }}</time></p>
        <h3>{{ p.title }}</h3>
        <p class="excerpt">{{ p.excerpt }}</p>
      </div>
    </a>
  `,
  styles: `
    .card { display: flex; flex-direction: column; height: 100%; color: inherit; text-decoration: none; background: var(--surface); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); transition: box-shadow 0.2s ease, transform 0.2s ease; }
    .card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
    .media { aspect-ratio: 16 / 10; background: var(--blue-50); overflow: hidden; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .placeholder { width: 100%; height: 100%; display: grid; place-items: center; background: linear-gradient(135deg, var(--blue-50), var(--blush)); }
    .placeholder span { font-family: var(--serif); font-size: 64px; color: var(--navy); opacity: 0.35; }
    .body { padding: 18px 20px 22px; display: flex; flex-direction: column; gap: 8px; }
    .meta { margin: 0; font-size: 13px; color: var(--muted); }
    h3 { margin: 0; font-family: var(--serif); font-size: 22px; font-weight: 600; line-height: 1.2; color: var(--navy); }
    .excerpt { margin: 0; font-size: 15px; color: var(--text-soft); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    @media (prefers-reduced-motion: reduce) { .card, .card:hover { transition: none; transform: none; } }
  `,
})
export class PostCard {
  readonly post = input.required<PostSummary>();
}
