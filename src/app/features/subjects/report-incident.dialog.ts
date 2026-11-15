import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IncidentImpact, IncidentResult } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { INCIDENT_IMPACT_LABELS } from './incident.helpers';

export interface ReportIncidentData {
  equipmentId: string;
  equipmentName: string;
  /** Hoy en el establecimiento (AAAA-MM-DD): no se reporta a futuro. */
  today: string;
}

/** Reportar una falla: deja el equipo restringido o fuera de servicio hasta cerrar la reparación. */
@Component({
  selector: 'app-report-incident-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Reportar falla · {{ data.equipmentName }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Fecha de la falla</mat-label>
          <input matInput type="date" formControlName="reportedOn" [max]="data.today" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Qué pasó</mat-label>
          <textarea matInput rows="3" formControlName="description" maxlength="2000"></textarea>
        </mat-form-field>
        <div class="impact">
          <span id="impact-label">¿Cómo queda el equipo?</span>
          <mat-button-toggle-group formControlName="impact" aria-labelledby="impact-label">
            @for (option of impacts; track option[0]) {
              <mat-button-toggle [value]="option[0]">{{ option[1] }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        </div>
        @if (form.hasError('future')) { <p class="error" role="alert">La fecha no puede ser posterior a hoy.</p> }
      </form>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Reportar falla</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; min-width: 420px; padding-top: 8px; }
    @media (max-width: 767.98px) { .form { min-width: 0; } }
    .impact { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; font-size: 14px; }
    .error { color: #b91c1c; font-size: 13px; }
  `],
})
export class ReportIncidentDialogComponent {
  readonly data = inject<ReportIncidentData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ReportIncidentDialogComponent, IncidentResult>);
  private readonly api = inject(FacilityApiService);
  /** Uno por formulario: reintentar tras un error no duplica la falla. */
  private readonly idempotencyKey = crypto.randomUUID();
  readonly impacts = Object.entries(INCIDENT_IMPACT_LABELS) as [IncidentImpact, string][];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private readonly fb = inject(FormBuilder).nonNullable;

  readonly form = this.fb.group(
    {
      reportedOn: [this.data.today, Validators.required],
      description: ['', [Validators.required, Validators.pattern(/\S/)]],
      impact: this.fb.control<IncidentImpact | null>(null, Validators.required),
    },
    { validators: notAfter('reportedOn', this.data.today) },
  );

  save(): void {
    if (this.form.invalid || this.saving()) return;
    const { reportedOn, description, impact } = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .reportIncident(this.data.equipmentId, { reportedOn, description: description.trim(), impact: impact as IncidentImpact }, this.idempotencyKey)
      .subscribe({
        next: (result) => this.ref.close(result),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(apiMessage(err));
        },
      });
  }
}

/** La fecha del campo no pasa de `today` (AAAA-MM-DD se compara como texto). */
export function notAfter(field: string, today: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const value = group.get(field)?.value as string;
    return value && value > today ? { future: true } : null;
  };
}
