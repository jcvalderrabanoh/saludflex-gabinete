import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Appointment, AppointmentKind, EvaluatedObligation } from '../../core/models/facility.models';
import { APPOINTMENT_KIND_LABELS } from '../../core/models/labels';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

export interface ScheduleAppointmentData {
  establishmentId: string;
  /** Obligaciones activas que la cita puede atender. */
  obligations: EvaluatedObligation[];
  /** Fecha local propuesta (hoy o el día que se eligió en el calendario). */
  date: string;
  /** Si viene, se edita esta cita en vez de crear una. */
  editing?: Appointment;
  /** Liga la cita nueva a esta obligación (p. ej. «Programar solicitud» en Municipal). */
  obligationId?: string;
  kind?: AppointmentKind;
}

@Component({
  selector: 'app-schedule-appointment-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.editing ? 'Editar cita' : 'Programar cita' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Obligación que atiende (opcional)</mat-label>
          <mat-select formControlName="obligationId">
            <mat-option value="">Ninguna</mat-option>
            @for (o of data.obligations; track o.id) {
              <mat-option [value]="o.id">{{ o.title }}@if (o.subjectLabel) { · {{ o.subjectLabel }} }</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="wide hinted">
          <mat-label>Título</mat-label>
          <input matInput formControlName="title" maxlength="255" />
          <mat-hint>Si lo dejas vacío, se usa el nombre de la obligación</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="kind">
            @for (k of kinds; track k) {
              <mat-option [value]="k">{{ kindLabels[k] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Fecha</mat-label>
          <input matInput type="date" formControlName="scheduledOn" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Hora (opcional)</mat-label>
          <input matInput type="time" formControlName="startTime" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Proveedor o lugar (opcional)</mat-label>
          <input matInput formControlName="location" maxlength="255" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" formControlName="notes" maxlength="2000"></textarea>
        </mat-form-field>
      </form>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!canSave() || saving()">
        {{ saving() ? 'Guardando…' : data.editing ? 'Guardar cambios' : 'Programar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; margin-top: 8px; }
    .wide { grid-column: 1 / -1; }
    .hinted { margin-bottom: 12px; }
    .error { color: #b91c1c; font-size: 13px; }
    @media (max-width: 640px) { .form { grid-template-columns: 1fr; } }
  `],
})
export class ScheduleAppointmentDialogComponent {
  readonly data = inject<ScheduleAppointmentData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ScheduleAppointmentDialogComponent, Appointment>);
  private readonly api = inject(FacilityApiService);
  readonly kinds = Object.keys(APPOINTMENT_KIND_LABELS) as AppointmentKind[];
  readonly kindLabels = APPOINTMENT_KIND_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    obligationId: [this.data.editing?.obligationId ?? this.data.obligationId ?? ''],
    title: [this.data.editing?.title ?? ''],
    kind: [this.data.editing?.kind ?? this.data.kind ?? ('service' as AppointmentKind), Validators.required],
    scheduledOn: [this.data.editing?.scheduledOn ?? this.data.date, Validators.required],
    startTime: [this.data.editing?.startTime ?? ''],
    location: [this.data.editing?.location ?? ''],
    notes: [this.data.editing?.notes ?? ''],
  });

  /** El backend pide título o una obligación de la que tomarlo. */
  canSave(): boolean {
    const { title, obligationId } = this.form.getRawValue();
    return this.form.valid && (!!title.trim() || !!obligationId);
  }

  save(): void {
    const input = this.form.getRawValue();
    const request = this.data.editing
      ? this.api.updateAppointment(this.data.editing.id, input)
      : this.api.scheduleAppointment(this.data.establishmentId, input);
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (appointment) => this.ref.close(appointment),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
