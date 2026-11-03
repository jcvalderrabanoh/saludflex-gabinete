import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WindowSegment } from './calendar.helpers';

/** Tono de la franja: el del estado del plazo (por vencer, vencido o aún sin abrir). */
export type BandTone = 'due-soon' | 'overdue' | 'upcoming';

/** Un día de la franja del plazo de pago; los extremos se redondean y el resto se une con la celda vecina. */
@Component({
  selector: 'app-window-band',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button [class]="'band seg-' + segment() + ' ' + tone()" (click)="pick.emit()" [matTooltip]="text()" [attr.aria-label]="text()">
      @if (showTitle()) { <mat-icon>payments</mat-icon><span>{{ title() }}</span> }
    </button>
  `,
  styles: [`
    :host { display: block; margin: 0 -6px; }
    :host(.seg-start), :host(.seg-single) { margin-left: 0; } :host(.seg-end), :host(.seg-single) { margin-right: 0; }
    .band { display: flex; align-items: center; gap: 4px; width: 100%; height: 22px; border: 0; padding: 0 6px; font: inherit; font-size: 11px; font-weight: 600; text-align: left; cursor: pointer; overflow: hidden; white-space: nowrap; }
    .band span { overflow: hidden; text-overflow: ellipsis; }
    mat-icon { font-size: 14px; width: 14px; height: 14px; flex: none; }
    .seg-start, .seg-single { border-radius: 8px 0 0 8px; } .seg-end { border-radius: 0 8px 8px 0; } .seg-single { border-radius: 8px; }
    .band:focus-visible { outline: 2px solid #1e3a8a; outline-offset: -2px; }
    .due-soon { background: #fde68a; color: #78350f; } .overdue { background: #fecaca; color: #7f1d1d; } .upcoming { background: #e2e8f0; color: #334155; }
  `],
  host: { '[class]': "'seg-' + segment()" },
})
export class WindowBandComponent {
  readonly segment = input.required<WindowSegment>();
  readonly tone = input.required<BandTone>();
  readonly title = input.required<string>();
  readonly showTitle = input(false);
  /** Texto completo (tooltip y lector de pantalla): nombre, plazo y estado. */
  readonly text = input.required<string>();
  readonly pick = output<void>();
}
