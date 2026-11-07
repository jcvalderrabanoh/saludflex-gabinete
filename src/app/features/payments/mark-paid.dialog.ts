import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { toCents } from './payments.helpers';

export interface MarkPaidData {
  paymentId: string;
  name: string;
  dueOn: string;
  today: string;
}

/** Solo para montos que varían: uno fijo se marca con un clic. */
@Component({
  selector: 'app-mark-paid-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Marcar {{ data.name }} como pagado</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Día en que se pagó</mat-label>
          <input matInput type="date" formControlName="paidOn" [max]="data.today" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Monto en MXN (opcional)</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="amount" />
        </mat-form-field>
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || form.invalid" (click)="save()">Marcar como pagado</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; padding-top: 8px; }
    .field-error { margin: 0; font-size: 13px; color: #b91c1c; }
  `],
})
export class MarkPaidDialogComponent {
  readonly data = inject<MarkPaidData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<MarkPaidDialogComponent>);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).group({
    paidOn: [this.data.today, Validators.required],
    amount: [null as number | null, Validators.min(0)],
  });

  save(): void {
    const { paidOn, amount } = this.form.getRawValue();
    const paidCents = toCents(amount);
    this.saving.set(true);
    this.api
      .markPaymentPaid(this.data.paymentId, { dueOn: this.data.dueOn, paidOn: paidOn ?? this.data.today, ...(paidCents === null ? {} : { paidCents }) })
      .subscribe({
        next: () => this.ref.close(true),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(apiMessage(err));
        },
      });
  }
}
