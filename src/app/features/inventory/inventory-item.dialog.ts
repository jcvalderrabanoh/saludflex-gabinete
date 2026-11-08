import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { InventoryItem, InventorySupplier } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { toItemInput } from './inventory.helpers';

export interface InventoryItemData {
  establishmentId: string;
  suppliers: InventorySupplier[];
  editing?: InventoryItem;
}

@Component({
  selector: 'app-inventory-item-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.editing ? 'Editar insumo' : 'Agregar insumo' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="wide"><mat-label>Nombre</mat-label><input matInput formControlName="name" maxlength="120" placeholder="Placa 35 x 43" /></mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="category">
            <mat-option value="clinical">Clínico</mat-option>
            <mat-option value="cleaning">Limpieza</mat-option>
            <mat-option value="other">Otro</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Unidad en la que se cuenta</mat-label><input matInput formControlName="baseUnit" maxlength="30" placeholder="pieza" /></mat-form-field>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Proveedor (opcional)</mat-label>
          <mat-select formControlName="supplierId">
            <mat-option [value]="null">Sin proveedor</mat-option>
            @for (supplier of data.suppliers; track supplier.id) { <mat-option [value]="supplier.id">{{ supplier.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Piezas por empaque</mat-label><input matInput type="number" min="1" step="1" formControlName="packSize" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Empaques mínimos por pedido</mat-label><input matInput type="number" min="1" step="1" formControlName="minOrderPacks" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Días que tarda en llegar</mat-label><input matInput type="number" min="0" step="1" formControlName="leadTimeDays" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Días extra de cobertura</mat-label><input matInput type="number" min="0" step="1" formControlName="safetyDays" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Existencia mínima (opcional)</mat-label><input matInput type="number" min="0" step="1" formControlName="minQuantity" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Existencia máxima (opcional)</mat-label><input matInput type="number" min="0" step="1" formControlName="maxQuantity" /></mat-form-field>
        @if (error()) { <p class="field-error wide" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || form.invalid" (click)="save()">Guardar insumo</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; padding-top: 8px; }
    .wide { grid-column: 1 / -1; }
    .field-error { margin: 0; font-size: 13px; color: #b91c1c; }
    @media (max-width: 640px) { .form { grid-template-columns: 1fr; } }
  `],
})
export class InventoryItemDialogComponent {
  readonly data = inject<InventoryItemData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<InventoryItemDialogComponent>);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private readonly e = this.data.editing;
  readonly form = inject(FormBuilder).group({
    name: [this.e?.name ?? '', [Validators.required, Validators.pattern(/\S/)]],
    category: [this.e?.category ?? 'clinical', Validators.required],
    baseUnit: [this.e?.baseUnit ?? 'pieza', [Validators.required, Validators.pattern(/\S/)]],
    supplierId: [this.e?.supplierId ?? (null as string | null)],
    packSize: [this.e?.packSize ?? 1, [Validators.required, Validators.min(1)]],
    minOrderPacks: [this.e?.minOrderPacks ?? 1, [Validators.required, Validators.min(1)]],
    leadTimeDays: [this.e?.leadTimeDays ?? (null as number | null), [Validators.required, Validators.min(0)]],
    safetyDays: [this.e?.safetyDays ?? (null as number | null), [Validators.required, Validators.min(0)]],
    minQuantity: [this.e?.minQuantity ?? (null as number | null), Validators.min(0)],
    maxQuantity: [this.e?.maxQuantity ?? (null as number | null), Validators.min(0)],
  });

  save(): void {
    const input = toItemInput(this.form.getRawValue(), !!this.e);
    const request = this.e ? this.api.updateInventoryItem(this.e.id, input) : this.api.createInventoryItem(this.data.establishmentId, input);
    this.saving.set(true);
    request.subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
