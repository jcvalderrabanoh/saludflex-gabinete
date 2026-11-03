import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EvaluatedObligation, PaymentWindow } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

export interface PaymentWindowData {
  obligation: EvaluatedObligation;
}

/** Qué le falta al plazo para guardarse, o null si está completo. */
export function windowFormError(startsOn: string, endsOn: string): string | null {
  if (!startsOn) return 'Elige la fecha desde la que se puede pagar.';
  if (!endsOn) return 'Elige el último día para pagar.';
  if (endsOn < startsOn) return 'El último día no puede ser antes del primero.';
  return null;
}

/** Plazo para pagar o tramitar (fecha A a fecha B): sin pagar, la obligación vence en B. */
@Component({
  selector: 'app-payment-window-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Plazo de pago</h2>
    <mat-dialog-content>
      <p class="what"><strong>{{ data.obligation.title }}</strong>@if (data.obligation.subjectLabel) { · {{ data.obligation.subjectLabel }} }</p>
      <p class="hint">Mientras no registres el pago, vence el último día. Cualquier registro desde el primer día cuenta como pagado.</p>
      <div class="dates">
        <mat-form-field appearance="outline">
          <mat-label>Desde</mat-label>
          <input matInput type="date" [value]="startsOn()" (input)="startsOn.set($any($event.target).value)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Hasta (último día)</mat-label>
          <input matInput type="date" [value]="endsOn()" [min]="startsOn()" (input)="endsOn.set($any($event.target).value)" />
        </mat-form-field>
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.obligation.window) {
        <button mat-button class="danger" (click)="remove()" [disabled]="saving()">Quitar plazo</button>
      }
      <span class="spacer"></span>
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
        {{ saving() ? 'Guardando…' : 'Guardar plazo' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .what { margin: 0 0 4px; } .hint { margin: 0 0 12px; color: #6b7684; font-size: 14px; }
    .dates { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .error { color: #b4232c; font-size: 14px; }
    .danger { color: #b4232c; } .spacer { flex: 1; }
  `],
})
export class PaymentWindowDialogComponent {
  readonly data = inject<PaymentWindowData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PaymentWindowDialogComponent, boolean>);
  private readonly api = inject(FacilityApiService);
  readonly startsOn = signal(this.data.obligation.window?.startsOn ?? '');
  readonly endsOn = signal(this.data.obligation.window?.endsOn ?? '');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  save(): void {
    const problem = windowFormError(this.startsOn(), this.endsOn());
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.send({ startsOn: this.startsOn(), endsOn: this.endsOn() });
  }

  remove(): void {
    this.send(null);
  }

  private send(window: PaymentWindow | null): void {
    this.saving.set(true);
    this.error.set(null);
    this.api.setPaymentWindow(this.data.obligation.id, window).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
