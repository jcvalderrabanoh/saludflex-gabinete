import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { InventoryOverviewRow } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

export interface InventoryCountData {
  establishmentId: string;
  rows: InventoryOverviewRow[];
}

/** Solo se guarda lo que se capturó: un conteo parcial de lo crítico también sirve. */
@Component({
  selector: 'app-inventory-count-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Conteo físico</h2>
    <mat-dialog-content>
      <p class="hint">Escribe lo que hay en el estante. Deja en blanco lo que no vayas a contar.</p>
      <form [formGroup]="form" class="form">
        @for (row of data.rows; track row.id) {
          <mat-form-field appearance="outline">
            <mat-label>{{ row.name }} ({{ row.baseUnit }})</mat-label>
            <input matInput type="number" min="0" step="1" [formControlName]="row.id" />
          </mat-form-field>
        }
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || form.invalid || !counted().length" (click)="save()">Guardar conteo</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .hint { margin: 0 0 8px; font-size: 14px; color: #475569; }
    .form { display: flex; flex-direction: column; padding-top: 8px; }
    .field-error { margin: 0; font-size: 13px; color: #b91c1c; }
  `],
})
export class InventoryCountDialogComponent {
  readonly data = inject<InventoryCountData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<InventoryCountDialogComponent>);
  private readonly requestId = crypto.randomUUID();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).group(
    Object.fromEntries(this.data.rows.map((row) => [row.id, new FormControl<number | null>(null, Validators.min(0))])),
  );

  counted(): { itemId: string; countedQuantity: number }[] {
    return Object.entries(this.form.getRawValue())
      .filter(([, value]) => value !== null)
      .map(([itemId, value]) => ({ itemId, countedQuantity: value as number }));
  }

  save(): void {
    this.saving.set(true);
    this.api.countInventory(this.data.establishmentId, { requestId: this.requestId, lines: this.counted() }).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
