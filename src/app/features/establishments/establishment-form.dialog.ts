import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Establishment, EstablishmentInput } from '../../core/models/facility.models';
import { ESTABLISHMENT_TYPE_LABELS, SERVICE_LABELS } from '../../core/models/labels';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

@Component({
  selector: 'app-establishment-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar establecimiento' : 'Nuevo establecimiento' }}</h2>
    <mat-dialog-content>
      @if (!data) {
        <p class="hint">Al darlo de alta se activan solas las obligaciones que le aplican por sus servicios. Las de cada persona o equipo (dosimetría, control de calidad) las activas después.</p>
      }
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="wide"><mat-label>Nombre</mat-label><input matInput formControlName="name" /></mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="type">
            @for (t of types; track t[0]) { <mat-option [value]="t[0]">{{ t[1] }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Servicios</mat-label>
          <mat-select formControlName="services" multiple>
            @for (s of services; track s[0]) { <mat-option [value]="s[0]">{{ s[1] }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Razón social</mat-label><input matInput formControlName="legalName" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>RFC</mat-label><input matInput formControlName="rfc" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>CLUES (opcional)</mat-label><input matInput formControlName="clues" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Código postal</mat-label><input matInput formControlName="postalCode" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Calle</mat-label><input matInput formControlName="street" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Número</mat-label><input matInput formControlName="exteriorNumber" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Colonia</mat-label><input matInput formControlName="neighborhood" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Municipio</mat-label><input matInput formControlName="municipality" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Estado</mat-label><input matInput formControlName="state" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Responsable sanitario</mat-label><input matInput formControlName="sanitaryResponsibleName" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Cédula del responsable</mat-label><input matInput formControlName="sanitaryResponsibleLicense" /></mat-form-field>
      </form>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    @media (max-width: 767.98px) { .form { grid-template-columns: 1fr; } }
    .wide { grid-column: 1 / -1; }
    .hint { font-size: 13px; color: #64748b; margin-top: 0; }
    .error { color: #b91c1c; font-size: 13px; }
  `],
})
export class EstablishmentFormDialogComponent {
  readonly data = inject<Establishment | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly ref = inject(MatDialogRef<EstablishmentFormDialogComponent, Establishment>);
  private readonly api = inject(FacilityApiService);
  readonly types = Object.entries(ESTABLISHMENT_TYPE_LABELS);
  readonly services = Object.entries(SERVICE_LABELS);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.data?.name ?? '', Validators.required],
    type: [this.data?.type ?? 'gabinete-imagen', Validators.required],
    services: [this.data?.services ?? [], Validators.required],
    legalName: [this.data?.legalName ?? ''],
    rfc: [this.data?.rfc ?? '', Validators.pattern(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/)],
    clues: [this.data?.clues ?? '', Validators.pattern(/^[A-Z]{5}\d{6}$/)],
    postalCode: [this.data?.postalCode ?? '', Validators.pattern(/^\d{5}$/)],
    street: [this.data?.street ?? ''],
    exteriorNumber: [this.data?.exteriorNumber ?? ''],
    neighborhood: [this.data?.neighborhood ?? ''],
    municipality: [this.data?.municipality ?? ''],
    state: [this.data?.state ?? ''],
    sanitaryResponsibleName: [this.data?.sanitaryResponsibleName ?? ''],
    sanitaryResponsibleLicense: [this.data?.sanitaryResponsibleLicense ?? '', Validators.pattern(/^\d{7,8}$/)],
  });

  save(): void {
    const input = this.form.getRawValue() as unknown as EstablishmentInput;
    const request = this.data ? this.api.updateEstablishment(this.data.id, input) : this.api.createEstablishment(input);
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (e) => this.ref.close(e),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
