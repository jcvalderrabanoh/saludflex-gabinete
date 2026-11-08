import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { InventoryMovementKind, InventoryOverviewRow } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

export interface InventoryMovementData {
  establishmentId: string;
  row: InventoryOverviewRow;
  kind: InventoryMovementKind;
}

/** Una entrada suma; una merma resta y siempre dice por qué. */
@Component({
  selector: 'app-inventory-movement-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ isWaste ? 'Registrar merma' : 'Registrar entrada' }} de {{ data.row.name }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Cantidad ({{ data.row.baseUnit }})</mat-label>
          <input matInput type="number" min="1" step="1" formControlName="quantity" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ isWaste ? 'Motivo' : 'Nota (opcional)' }}</mat-label>
          <input matInput formControlName="reason" maxlength="200" />
        </mat-form-field>
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || form.invalid" (click)="save()">{{ isWaste ? 'Guardar merma' : 'Guardar entrada' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; padding-top: 8px; }
    .field-error { margin: 0; font-size: 13px; color: #b91c1c; }
  `],
})
export class InventoryMovementDialogComponent {
  readonly data = inject<InventoryMovementData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<InventoryMovementDialogComponent>);
  private readonly requestId = crypto.randomUUID();
  readonly isWaste = this.data.kind === 'waste';
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).group({
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
    reason: ['', this.isWaste ? [Validators.required, Validators.pattern(/\S/)] : []],
  });

  save(): void {
    const { quantity, reason } = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .recordInventoryMovement(this.data.establishmentId, {
        requestId: this.requestId,
        itemId: this.data.row.id,
        kind: this.data.kind,
        quantity: quantity ?? 0,
        ...(reason?.trim() ? { reason } : {}),
      })
      .subscribe({
        next: () => this.ref.close(true),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(apiMessage(err));
        },
      });
  }
}
