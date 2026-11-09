import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { InventorySupplier } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

/**
 * Proveedor de un pago: se elige del catálogo del establecimiento (el mismo de
 * Inventario) o, con facility.manage, se agrega ahí mismo.
 */
@Component({
  selector: 'app-supplier-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <div class="row">
      <mat-form-field appearance="outline" class="grow">
        <mat-label>Proveedor (opcional)</mat-label>
        <mat-select [formControl]="control">
          <mat-option value="">Sin proveedor</mat-option>
          @for (s of suppliers; track s.id) { <mat-option [value]="s.id">{{ s.name }}</mat-option> }
        </mat-select>
        @if (suggestedName && !control.value) { <mat-hint>La IA leyó «{{ suggestedName }}»; elígelo o agrégalo.</mat-hint> }
      </mat-form-field>
      @if (canCreate && !adding()) {
        <button mat-stroked-button type="button" class="add" (click)="startAdding()">Nuevo proveedor</button>
      }
    </div>
    @if (adding()) {
      <div class="row">
        <mat-form-field appearance="outline" class="grow">
          <mat-label>Nombre del proveedor</mat-label>
          <input matInput [formControl]="name" maxlength="120" />
        </mat-form-field>
        <button mat-flat-button color="primary" type="button" class="add" [disabled]="saving()" (click)="create()">Agregar</button>
        <button mat-button type="button" class="add" (click)="adding.set(false)">Cancelar</button>
      </div>
      @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
    }
  `,
  styles: [`
    :host { display: block; }
    .row { display: flex; gap: 8px; align-items: flex-start; }
    .grow { flex: 1; min-width: 0; }
    .add { margin-top: 8px; white-space: nowrap; }
    .field-error { margin: 0; font-size: 13px; color: #b91c1c; }
    mat-hint { white-space: normal; }
  `],
})
export class SupplierFieldComponent {
  private readonly api = inject(FacilityApiService);

  @Input({ required: true }) establishmentId!: string;
  @Input({ required: true }) control!: FormControl<string>;
  @Input() suppliers: InventorySupplier[] = [];
  @Input() canCreate = false;
  /** Lo que leyó la IA, para proponerlo como nombre del proveedor nuevo. */
  @Input() suggestedName: string | null = null;
  @Output() readonly created = new EventEmitter<InventorySupplier>();

  readonly adding = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly name = new FormControl('', { nonNullable: true });

  startAdding(): void {
    this.name.setValue(this.suggestedName ?? '');
    this.error.set(null);
    this.adding.set(true);
  }

  create(): void {
    const name = this.name.value.trim();
    if (!name) {
      this.error.set('Escribe el nombre del proveedor.');
      return;
    }
    this.saving.set(true);
    this.api.createPaymentSupplier(this.establishmentId, { name }).subscribe({
      next: (supplier) => {
        this.saving.set(false);
        this.adding.set(false);
        this.created.emit(supplier);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
