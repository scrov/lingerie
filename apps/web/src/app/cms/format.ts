import { Pipe, PipeTransform } from '@angular/core';

const dateFormat = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' });

/** "2026-02-06T08:43:52Z" -> "6 février 2026" (Quebec time). */
@Pipe({ name: 'frDate' })
export class FrDatePipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : dateFormat.format(d);
  }
}

/** "450-304-3555" -> "tel:+14503043555". */
@Pipe({ name: 'telHref' })
export class TelHrefPipe implements PipeTransform {
  transform(phone: string | null | undefined): string {
    const digits = (phone ?? '').replace(/\D/g, '');
    if (!digits) return '';
    return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
  }
}

/** Groups pages by their menu section. */
export function bySection<T extends { nav_section: string }>(pages: readonly T[], section: string): T[] {
  return pages.filter((p) => p.nav_section === section);
}
