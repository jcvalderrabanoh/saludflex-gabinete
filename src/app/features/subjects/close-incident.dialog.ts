import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EquipmentIncident, IncidentResult } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { notAfter } from './report-incident.dialog';

export interface CloseIncidentData {
  incident: EquipmentIncident;
  today: string;
}

/** Cerrar la reparación de un correctivo abierto. Cerrado ya no se edita. */
@Component({
  selector: 'app-close-incident-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Cerrar reparación</h2>
    <mat-dialog-content>
      <p class="incident">Falla del {{ data.incident.reportedOn }}: {{ data.incident.description }}</p>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Fecha de la reparación</mat-label>
          <input matInput type="date" formControlName="closedOn" [min]="data.incident.reportedOn" [max]="data.today" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Qué se hizo</mat-label>
          <textarea matInput rows="3" formControlName="resolution" maxlength="2000"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Quién la hizo (opcional)</mat-label>
          <input matInput formControlName="performedBy" maxlength="255" placeholder="Proveedor o técnico" />
        </mat-form-field>
        @if (form.hasError('future')) { <p class="error" role="alert">La fecha no puede ser posterior a hoy.</p> }
        @if (form.hasError('beforeReport')) { <p class="error" role="alert">La reparación no puede ser antes del reporte ({{ data.incident.reportedOn }}).</p> }
      </form>
      <p class="hint">Al cerrar, la reparación queda en la bitácora del equipo y ya no se puede editar.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Cerrar reparación</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; min-width: 420px; }
    @media (max-width: 767.98px) { .form { min-width: 0; } }
    .incident { font-size: 14px; color: #334155; margin: 4px 0 12px; }
    .hint { font-size: 12px; color: #64748b; margin: 0; }
    .error { color: #b91c1c; font-size: 13px; }
  `],
})
export class CloseIncidentDialogComponent {
  readonly data = inject<CloseIncidentData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CloseIncidentDialogComponent, IncidentResult>);
  private readonly api = inject(FacilityApiService);
  private readonly idempotencyKey = crypto.randomUUID();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      closedOn: [this.data.today, Validators.required],
      resolution: ['', [Validators.required, Validators.pattern(/\S/)]],
      performedBy: [''],
    },
    { validators: [notAfter('closedOn', this.data.today), notBefore('closedOn', this.data.incident.reportedOn)] },
  );

  save(): void {
    if (this.form.invalid || this.saving()) return;
    const { closedOn, resolution, performedBy } = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .closeIncident(this.data.incident.id, { closedOn, resolution: resolution.trim(), performedBy: performedBy.trim() }, this.idempotencyKey)
      .subscribe({
        next: (result) => this.ref.close(result),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(apiMessage(err));
        },
      });
  }
}

function notBefore(field: string, start: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const value = group.get(field)?.value as string;
    return value && value < start ? { beforeReport: true } : null;
  };
}
