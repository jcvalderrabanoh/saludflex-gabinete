import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { map, startWith } from 'rxjs';
import { AgendaResource } from '../../core/models/agenda.models';
import { Equipment, EquipmentModality } from '../../core/models/facility.models';
import { MODALITY_LABELS } from '../../core/models/labels';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { EstablishmentFieldComponent } from '../../shared/components/establishment-field.component';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { flattenWeek, startingWeek, weekProblem, weekRows } from './settings.helpers';

export interface AgendaEquipmentData {
  establishmentId: string;
  /** La modalidad del servicio que pidió el equipo, para no volver a preguntarla. */
  modality?: string;
  /** Si viene, se editan su nombre, modalidad y sala; el horario se edita aparte. */
  editing?: Pick<AgendaResource, 'id' | 'name' | 'modality' | 'room'>;
}

export interface AgendaEquipmentResult {
  equipmentId: string;
  name: string;
  created: boolean;
  /** Un alta guarda el horario después del equipo: puede quedar el equipo sin horario. */
  hoursSaved: boolean;
  /** Obligaciones (mantenimiento, control de calidad) que se activaron al registrarlo. */
  activated: number;
}

const MONDAY_TO_FRIDAY = [1, 2, 3, 4, 5];
const DEFAULT_OPENS = '08:00';
const DEFAULT_CLOSES = '18:00';
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Alta de un equipo desde la agenda, con su horario, para que se pueda agendar en él de inmediato. */
@Component({
  selector: 'app-agenda-equipment-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, EstablishmentFieldComponent],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Editar equipo' : 'Agregar equipo' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" (ngSubmit)="save()">
        <app-establishment-field class="wide" [control]="form.controls.establishmentId" [locked]="!!editing" />
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" maxlength="120" placeholder="Ultrasonido 1" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Modalidad</mat-label>
          <mat-select formControlName="modality">
            @for (modality of modalities; track modality) {
              <mat-option [value]="modality">{{ labels[modality] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Sala (opcional)</mat-label>
          <input matInput formControlName="room" maxlength="120" />
        </mat-form-field>

        @if (!editing) {
          <fieldset class="wide days">
            <legend>Días que trabaja</legend>
            <div class="chips">
              @for (day of week; track day.weekday) {
                <button type="button" class="chip" [class.on]="weekdays().includes(day.weekday)" [attr.aria-pressed]="weekdays().includes(day.weekday)" (click)="toggleDay(day.weekday)">{{ day.label }}</button>
              }
            </div>
          </fieldset>
          <mat-form-field appearance="outline">
            <mat-label>Abre</mat-label>
            <input matInput type="time" formControlName="opensAt" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Cierra</mat-label>
            <input matInput type="time" formControlName="closesAt" />
          </mat-form-field>
          <p class="hint wide">Después puedes poner otro horario por día, comidas y bloqueos en «Configurar agenda». Al registrarlo se activan su mantenimiento y, si emite radiación, su control de calidad. Número de serie, marca y modelo se completan en «Equipos y personal».</p>
        }
        @if (problem()) { <p class="error wide" role="alert">{{ problem() }}</p> }
        @if (error()) { <p class="error wide" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!canSave() || saving()">{{ saving() ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar equipo' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; margin-top: 8px; }
    .wide { grid-column: 1 / -1; }
    .days { border: 0; margin: 0 0 16px; padding: 0; }
    .days legend { margin-bottom: 8px; font-size: 14px; font-weight: 600; color: #334155; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { min-width: 72px; min-height: 40px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font: inherit; font-size: 14px; color: #0f172a; cursor: pointer; }
    .chip.on { border-color: #0067d6; background: #0067d6; color: #fff; font-weight: 600; }
    .chip:focus-visible { outline: 2px solid #0067d6; outline-offset: 2px; }
    .hint { margin: 0 0 8px; font-size: 13px; color: #475569; }
    .error { margin: 0 0 8px; color: #b91c1c; font-size: 14px; }
    @media (max-width: 640px) { .form { grid-template-columns: 1fr; } .chip { min-height: 44px; } }
  `],
})
export class AgendaEquipmentDialogComponent {
  readonly data = inject<AgendaEquipmentData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AgendaEquipmentDialogComponent, AgendaEquipmentResult>);
  private readonly facility = inject(FacilityApiService);
  private readonly agenda = inject(AgendaApiService);

  readonly editing = this.data.editing ?? null;
  readonly modalities = Object.keys(MODALITY_LABELS) as EquipmentModality[];
  readonly labels = MODALITY_LABELS;
  readonly week = weekRows([]);
  readonly weekdays = signal<number[]>(MONDAY_TO_FRIDAY);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.editing?.name ?? '', [Validators.required, Validators.pattern(/\S/)]],
    modality: [this.editing?.modality ?? this.data.modality ?? '', Validators.required],
    room: [this.editing?.room ?? ''],
    establishmentId: [this.data.establishmentId],
    opensAt: [DEFAULT_OPENS],
    closesAt: [DEFAULT_CLOSES],
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });

  private readonly startingHours = computed(() => startingWeek(this.weekdays(), this.value().opensAt, this.value().closesAt));
  /** Mismas reglas que el horario de «Configurar agenda»; al editar no aplica. */
  readonly problem = computed(() => {
    if (this.editing) return null;
    const { opensAt, closesAt } = this.value();
    if (!CLOCK.test(opensAt) || !CLOCK.test(closesAt)) return 'Escribe la hora de apertura y la de cierre.';
    return weekProblem(this.startingHours());
  });

  toggleDay(weekday: number): void {
    this.weekdays.update((days) => (days.includes(weekday) ? days.filter((day) => day !== weekday) : [...days, weekday]));
  }

  canSave(): boolean {
    const hasDays = this.editing !== null || this.weekdays().length > 0;
    return this.form.controls.name.valid && this.form.controls.modality.valid && hasDays && !this.problem();
  }

  save(): void {
    if (this.saving() || !this.canSave()) return;
    const { name, modality, room, establishmentId } = this.form.getRawValue();
    const input: Partial<Equipment> = { name: name.trim(), modality: modality as EquipmentModality, room: room.trim() };
    const request = this.editing ? this.facility.updateEquipment(this.editing.id, input) : this.facility.registerEquipment(establishmentId, input);
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (result) => this.afterEquipment({ equipmentId: result.subject.id, name: result.subject.name, created: !this.editing, hoursSaved: !!this.editing, activated: result.activated.length }),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  /** Un alta guarda después el horario; si falla, el equipo ya existe y se dice qué falta. */
  private afterEquipment(result: AgendaEquipmentResult): void {
    if (!result.created) {
      this.ref.close(result);
      return;
    }
    this.agenda.replaceHours(result.equipmentId, flattenWeek(this.startingHours())).subscribe({
      next: () => this.ref.close({ ...result, hoursSaved: true }),
      error: () => this.ref.close(result),
    });
  }

  private fail(err: HttpErrorResponse): void {
    this.saving.set(false);
    this.error.set(apiMessage(err));
  }
}
