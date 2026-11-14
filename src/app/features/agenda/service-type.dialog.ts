import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AgendaResource, AgendaServiceType } from '../../core/models/agenda.models';
import { EquipmentModality } from '../../core/models/facility.models';
import { MODALITY_LABELS } from '../../core/models/labels';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { EQUIPMENT_ROUTE, placeOf } from './settings.helpers';

export interface ServiceTypeDialogData {
  /** Si viene, se edita este servicio en vez de crear uno. */
  editing?: AgendaServiceType;
  /** Equipos del establecimiento, para decir dónde se agendará; sin ellos solo se da la pista general. */
  equipment?: AgendaResource[];
  establishmentId?: string;
}

const MAX_MINUTES = 480;

/** Alta o edición de un tipo de servicio de la agenda. */
@Component({
  selector: 'app-service-type-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.editing ? 'Editar servicio' : 'Agregar servicio' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" maxlength="120" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="hinted">
          <mat-label>Modalidad</mat-label>
          <mat-select formControlName="modality">
            @for (modality of modalities; track modality) {
              <mat-option [value]="modality">{{ labels[modality] }}</mat-option>
            }
          </mat-select>
          <mat-hint>{{ modalityHint() }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="hinted">
          <mat-label>Duración (minutos)</mat-label>
          <input matInput type="number" formControlName="durationMinutes" min="1" [max]="maxMinutes" inputmode="numeric" />
          <mat-hint>De 1 a {{ maxMinutes }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Indicaciones para el paciente (opcional)</mat-label>
          <textarea matInput rows="3" formControlName="preparation" maxlength="2000"></textarea>
        </mat-form-field>
      </form>
      @if (place(); as place) {
        @if (!place.ready) {
          <p class="no-place" role="status">
            <mat-icon aria-hidden="true">warning</mat-icon>
            <span><strong>Sin dónde agendarse.</strong> {{ place.text }} Puedes guardarlo, pero no se podrá agendar hasta que haya uno. <a [routerLink]="equipmentRoute" mat-dialog-close>Dar de alta un equipo</a></span>
          </p>
        }
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">{{ saving() ? 'Guardando…' : data.editing ? 'Guardar cambios' : 'Agregar servicio' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; margin-top: 8px; }
    .wide { grid-column: 1 / -1; }
    .hinted { margin-bottom: 12px; }
    .error { color: #b91c1c; font-size: 14px; }
    .no-place { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 8px; padding: 12px; border-radius: 8px; background: #fff3d6; color: #5c4000; font-size: 14px; }
    .no-place mat-icon { flex: none; color: #805800; font-size: 20px; width: 20px; height: 20px; }
    .no-place a { color: #1d4ed8; font-weight: 600; }
    @media (max-width: 640px) { .form { grid-template-columns: 1fr; } }
  `],
})
export class ServiceTypeDialogComponent {
  readonly data = inject<ServiceTypeDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ServiceTypeDialogComponent, AgendaServiceType>);
  private readonly api = inject(AgendaApiService);
  readonly modalities = Object.keys(MODALITY_LABELS) as EquipmentModality[];
  readonly labels = MODALITY_LABELS;
  readonly maxMinutes = MAX_MINUTES;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.data.editing?.name ?? '', [Validators.required, Validators.pattern(/\S/)]],
    modality: [this.data.editing?.modality ?? '', Validators.required],
    durationMinutes: [this.data.editing?.durationMinutes ?? 15, [Validators.required, Validators.min(1), Validators.max(MAX_MINUTES), Validators.pattern(/^\d+$/)]],
    preparation: [this.data.editing?.preparation ?? ''],
  });

  readonly equipmentRoute = EQUIPMENT_ROUTE;
  private readonly modality = toSignal(this.form.controls.modality.valueChanges.pipe(startWith(this.form.controls.modality.value), map(String)), { requireSync: true });
  /** Dónde se agendará con la modalidad elegida; `null` si no se conocen los equipos o falta la modalidad. */
  readonly place = computed(() => placeOf(this.modality(), this.data.equipment ?? null, this.data.establishmentId ?? null));
  /** Sin equipos el aviso va aparte, más visible; la pista no lo repite. */
  readonly modalityHint = computed(() => {
    const place = this.place();
    if (!place) return 'Se agenda en los equipos de esta modalidad';
    return place.ready ? place.text : '';
  });

  save(): void {
    if (this.saving() || this.form.invalid) return;
    const { name, modality, durationMinutes, preparation } = this.form.getRawValue();
    const input = { name: name.trim(), modality, durationMinutes: Number(durationMinutes), preparation: preparation.trim() || null };
    const request = this.data.editing ? this.api.updateServiceType(this.data.editing.id, input) : this.api.createServiceType(input);
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (service) => this.ref.close(service),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
