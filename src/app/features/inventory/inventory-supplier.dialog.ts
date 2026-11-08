import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

@Component({
  selector: 'app-inventory-supplier-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Agregar proveedor</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline"><mat-label>Nombre</mat-label><input matInput formControlName="name" maxlength="120" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Contacto (opcional)</mat-label><input matInput formControlName="contact" maxlength="200" /></mat-form-field>
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || form.invalid" (click)="save()">Guardar proveedor</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; padding-top: 8px; }
    .field-error { margin: 0; font-size: 13px; color: #b91c1c; }
  `],
})
export class InventorySupplierDialogComponent {
  readonly data = inject<{ establishmentId: string }>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<InventorySupplierDialogComponent>);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    contact: [''],
  });

  save(): void {
    const { name, contact } = this.form.getRawValue();
    this.saving.set(true);
    this.api.createInventorySupplier(this.data.establishmentId, { name, ...(contact.trim() ? { contact } : {}) }).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
