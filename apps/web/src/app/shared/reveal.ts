import { Directive, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Fades and lifts an element in when it scrolls into view.
 * Server-rendered HTML and visitors without JavaScript see everything immediately: the element is only hidden
 * in the browser, and only if it starts below the fold. Off for visitors who prefer reduced motion.
 *
 *   <li appReveal [revealDelay]="$index * 80">…</li>
 */
@Directive({ selector: '[appReveal]' })
export class Reveal {
  /** Milliseconds to wait before this element animates, for staggered lists. */
  readonly revealDelay = input(0);

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

      el.style.setProperty('--reveal-delay', `${Math.min(this.revealDelay(), 600)}ms`);
      el.classList.add('reveal-hidden');
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          el.classList.add('reveal-shown');
          el.classList.remove('reveal-hidden');
          observer.disconnect();
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
      );
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
