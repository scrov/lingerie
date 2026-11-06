import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Cms, GalleryImage, SiteSettings, loadable } from '../cms/cms';
import { TelHrefPipe, bySection } from '../cms/format';
import { Icon, IconName } from '../shared/icon';
import { Lightbox } from '../shared/lightbox';
import { PostCard } from '../shared/post-card';
import { Reveal } from '../shared/reveal';
import { RichText } from '../shared/rich-text';
import { Seo } from '../shared/seo';
import { VisitInfo } from '../shared/visit-info';

const YOUTUBE_EMBED = /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,20})(?:[?#].*)?$/;
const SLIDE_MS = 5500;

@Component({
  selector: 'app-home',
  imports: [RouterLink, TelHrefPipe, Icon, Lightbox, PostCard, Reveal, RichText, VisitInfo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
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

  /** Images of the « Nouveautés » gallery (Réglages › galerie d’accueil). */
  protected readonly gallery = computed<GalleryImage[]>(() =>
    (this.settings().home_gallery ?? []).filter((g): g is GalleryImage => !!g && typeof g.src === 'string' && g.src !== ''),
  );

  /** Hero slideshow: the home image first, then the gallery. */
  protected readonly slides = computed<GalleryImage[]>(() => {
    const s = this.settings();
    const out: GalleryImage[] = s.hero_image ? [{ src: s.hero_image, alt: s.hero_title || '' }] : [];
    for (const g of this.gallery()) if (!out.some((x) => x.src === g.src)) out.push(g);
    return out.slice(0, 6);
  });
  protected readonly active = signal(0);
  protected readonly paused = signal(false);

  /** Only YouTube embeds are allowed, always through the privacy-enhanced domain. */
  protected readonly video = computed<SafeResourceUrl | null>(() => {
    const m = YOUTUBE_EMBED.exec(this.settings().home_video_url ?? '');
    return m ? this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`) : null;
  });

  /** What sets the boutique apart, from its own description. */
  protected readonly features: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'ruler',
      title: 'Prise de mesures',
      text: 'Nos conseillères prennent vos mesures avec respect et discrétion, pour un bon maintien et le plus grand confort.',
    },
    {
      icon: 'ribbon',
      title: 'Post-opératoire',
      text: 'Service-conseil en vêtements postopératoires et prothèses mammaires, par une équipe formée et certifiée par Anita.',
    },
    {
      icon: 'heart',
      title: 'Toutes les tailles',
      text: 'Des marques comme Anita, Rosa Faia, Montelle, Van de Velde, PrimaDonna, Marie Jo et Fit Fully Yours.',
    },
  ];

  /**
   * Product cards on a 3-column grid: the first is two columns wide, and so is the last when that fills the final
   * row (e.g. 7 categories: 2+1, 3, 1+2).
   */
  protected wide(i: number): boolean {
    const n = this.products().length;
    return i === 0 || (n > 2 && i === n - 1 && (n + 1) % 3 === 2);
  }

  private readonly lightbox = viewChild(Lightbox);

  constructor() {
    effect(() => {
      const s = this.settings();
      this.seo.set({
        description: s.hero_subtitle || s.tagline || s.seo_description || 'Lingerie féminine pour toutes les tailles à Saint-Jérôme.',
        image: s.hero_image,
      });
    });

    // Advance the hero slideshow in the browser, unless the visitor prefers less motion or is looking at it.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const timer = setInterval(() => {
        const n = this.slides().length;
        if (n > 1 && !this.paused() && document.visibilityState === 'visible') this.active.update((i) => (i + 1) % n);
      }, SLIDE_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  protected showSlide(i: number): void {
    this.active.set(i);
  }

  protected openGallery(i: number): void {
    this.lightbox()?.open(i);
  }
}
