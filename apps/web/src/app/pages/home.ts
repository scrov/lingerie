import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Cms, SiteSettings, loadable } from '../cms/cms';
import { TelHrefPipe, bySection } from '../cms/format';
import { PostCard } from '../shared/post-card';
import { RichText } from '../shared/rich-text';
import { Seo } from '../shared/seo';
import { VisitInfo } from '../shared/visit-info';

const YOUTUBE_EMBED = /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,20})(?:[?#].*)?$/;

@Component({
  selector: 'app-home',
  imports: [RouterLink, TelHrefPipe, PostCard, RichText, VisitInfo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private readonly cms = inject(Cms);
  private readonly seo = inject(Seo);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly settings = toSignal(this.cms.settings(), { initialValue: {} as SiteSettings });
  protected readonly products = toSignal(this.cms.pages().pipe(map((pages) => bySection(pages, 'produits'))), { initialValue: [] });
  protected readonly latest = toSignal(loadable(this.cms.posts({ limit: 3 }).pipe(map((r) => r.data))), { requireSync: true });
  protected readonly latestPosts = computed(() => {
    const l = this.latest();
    return l.state === 'ready' ? l.value : [];
  });

  /** Only YouTube embeds are allowed, always through the privacy-enhanced domain. */
  protected readonly video = computed<SafeResourceUrl | null>(() => {
    const m = YOUTUBE_EMBED.exec(this.settings().home_video_url ?? '');
    return m ? this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`) : null;
  });

  constructor() {
    effect(() => {
      const s = this.settings();
      this.seo.set({
        description: s.hero_subtitle || s.tagline || 'Lingerie féminine pour toutes les tailles à Saint-Jérôme.',
        image: s.hero_image,
      });
    });
  }
}
