import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Renders CMS HTML (already reduced to a small tag set by the admin editor).
 * Angular's built-in sanitizer still runs on [innerHTML] as a second line of defence.
 * Styling lives in the global `.prose` rules in styles.css because this content is outside the component's view encapsulation.
 */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'prose' },
  template: `<div [innerHTML]="html()"></div>`,
})
export class RichText {
  readonly html = input.required<string>();
}
