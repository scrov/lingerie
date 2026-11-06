import { ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { GalleryImage } from '../cms/cms';
import { Icon } from './icon';

/**
 * Full-screen image preview on a native <dialog>: zooms in, arrows and swipe to move, Escape or a click
 * outside the picture to close. `open(i)` shows image i.
 */
@Component({
  selector: 'app-lightbox',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="animated lightbox m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-white"
      aria-label="Aperçu des images"
      (keydown)="onKey($event)"
      (pointerdown)="swipeStart($event)"
      (pointerup)="swipeEnd($event)"
    >
      <div class="flex h-full flex-col items-center justify-center gap-4 px-4 pb-6 pt-16 sm:px-20" (click)="onBackdropClick($event)">
        @for (img of shown(); track img.src) {
          <img
            [src]="img.src"
            [alt]="img.alt"
            class="max-h-[calc(100dvh-9rem)] max-w-full animate-zoom-in rounded-2xl object-contain shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]"
          />
          <p class="max-w-xl text-center text-sm text-white/80">
            @if (img.alt) {
              {{ img.alt }} ·
            }
            <span class="tabular-nums">{{ index() + 1 }} / {{ images().length }}</span>
          </p>
        }
      </div>

      <button type="button" class="lb-btn right-4 top-4" (click)="close()">
        <app-icon name="x" class="size-5" />
        <span class="sr-only">Fermer</span>
      </button>
      @if (images().length > 1) {
        <button type="button" class="lb-btn left-3 top-1/2 -translate-y-1/2 sm:left-6" (click)="prev()">
          <app-icon name="chevron-left" class="size-6" />
          <span class="sr-only">Image précédente</span>
        </button>
        <button type="button" class="lb-btn right-3 top-1/2 -translate-y-1/2 sm:right-6" (click)="next()">
          <app-icon name="chevron-right" class="size-6" />
          <span class="sr-only">Image suivante</span>
        </button>
      }
    </dialog>
  `,
  styles: `
    .lb-btn {
      position: absolute;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 999px;
      border: 1px solid oklch(1 0 0 / 20%);
      background: oklch(1 0 0 / 10%);
      color: #fff;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: background-color 0.2s ease, scale 0.2s ease;
    }
    .lb-btn:hover {
      background: oklch(1 0 0 / 22%);
      scale: 1.06;
    }
  `,
})
export class Lightbox {
  readonly images = input.required<GalleryImage[]>();
  protected readonly index = signal(0);
  /** A one-item list keyed by src, so each new image re-runs the zoom-in animation. */
  protected readonly shown = computed(() => {
    const img = this.images()[this.index()];
    return img ? [img] : [];
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private swipeX: number | null = null;

  open(i: number): void {
    this.index.set(Math.max(0, Math.min(i, this.images().length - 1)));
    const el = this.dialog().nativeElement;
    if (!el.open) el.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected next(): void {
    const n = this.images().length;
    if (n) this.index.update((i) => (i + 1) % n);
  }

  protected prev(): void {
    const n = this.images().length;
    if (n) this.index.update((i) => (i - 1 + n) % n);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowRight') this.next();
    else if (e.key === 'ArrowLeft') this.prev();
    else return;
    e.preventDefault();
  }

  /** Clicks on the dark area around the picture close the preview. */
  protected onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.close();
  }

  protected swipeStart(e: PointerEvent): void {
    this.swipeX = e.pointerType === 'mouse' ? null : e.clientX;
  }

  protected swipeEnd(e: PointerEvent): void {
    if (this.swipeX === null) return;
    const dx = e.clientX - this.swipeX;
    this.swipeX = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) this.next();
    else this.prev();
  }
}
