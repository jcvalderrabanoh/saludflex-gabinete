import { Component, input } from '@angular/core';
import { ObligationStatus } from '../../core/models/facility.models';
import { STATUS_LABELS } from '../../core/models/labels';

@Component({
  selector: 'app-status-chip',
  standalone: true,
  template: `<span class="chip" [class]="'chip ' + status()">{{ label() }}</span>`,
  styles: [`
    .chip { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .ok { background: #dcfce7; color: #166534; }
    .due-soon { background: #fef3c7; color: #92400e; }
    .expiry-unknown { background: #fff3d6; color: #805800; }
    .overdue, .missing { background: #fee2e2; color: #991b1b; }
  `],
})
export class StatusChipComponent {
  readonly status = input.required<ObligationStatus>();
  label(): string {
    return STATUS_LABELS[this.status()];
  }
}
