import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { InventoryOrderSuggestion } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

export interface InventoryOrderData {
  establishmentId: string;
  suggestion: InventoryOrderSuggestion;
}

/** La cantidad sugerida se puede ajustar antes de guardar el borrador. */
@Component({
  selector: 'app-inventory-order-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Preparar pedido a {{ data.suggestion.supplierName }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        @for (line of data.suggestion.lines; track line.itemId) {
          <mat-form-field appearance="outline">
            <mat-label>{{ line.name }}: empaques de {{ line.packSize }}</mat-label>
            <input matInput type="number" min="1" step="1" [formControlName]="line.itemId" />
          </mat-form-field>
        }
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || form.invalid" (click)="save()">Guardar borrador</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; padding-top: 8px; }
    .field-error { margin: 0; font-size: 13px; color: #b91c1c; }
  `],
})
export class InventoryOrderDialogComponent {
  readonly data = inject<InventoryOrderData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<InventoryOrderDialogComponent>);
  private readonly requestId = crypto.randomUUID();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).group(
    Object.fromEntries(
      this.data.suggestion.lines.map((line) => [line.itemId, new FormControl<number>(line.packs, [Validators.required, Validators.min(1)])]),
    ),
  );

  save(): void {
    const lines = Object.entries(this.form.getRawValue()).map(([itemId, packs]) => ({ itemId, packs: packs as number }));
    this.saving.set(true);
    this.api
      .createInventoryOrder(this.data.establishmentId, { requestId: this.requestId, supplierId: this.data.suggestion.supplierId ?? '', lines })
      .subscribe({
        next: () => this.ref.close(true),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(apiMessage(err));
        },
      });
  }
}
