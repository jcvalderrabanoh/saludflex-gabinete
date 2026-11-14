import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { AgendaAppointment, AgendaBooked, AgendaConflict, AgendaContact, AgendaLane, AgendaServiceType, AgendaSlot } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { clockOf } from './agenda.helpers';
import { bookingOf, conflictMessage, instantAt, lanesFor } from './booking.helpers';

export interface BookAppointmentData {
  /** Fecha local propuesta: el día que se está viendo. */
  date: string;
  timeZone: string;
  /** Equipos del establecimiento. */
  lanes: AgendaLane[];
  services: AgendaServiceType[];
  /** Equipo y hora del hueco donde se hizo clic. */
  equipmentId?: string;
  clock?: string;
  /** Para «agendar otra cita para este paciente». */
  contact?: AgendaContact;
  /** Si viene, se mueve esta cita de hora en vez de crear una. */
  rescheduling?: AgendaAppointment;
}

const SEARCH_AFTER_MS = 300;
const SEARCH_MIN_LENGTH = 2;
const CONFLICT = 409;
const LOCAL_DATE = /^20\d{2}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Agendar una cita o mover una de hora. El orden de los campos sigue la llamada con el paciente. */
@Component({
  selector: 'app-book-appointment-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ moving ? 'Reprogramar cita' : 'Agendar cita' }}</h2>
    <mat-dialog-content>
      @if (!moving && data.services.length === 0) {
        <p class="error" role="alert"><mat-icon aria-hidden="true">error</mat-icon> Aún no hay servicios en el catálogo. Alguien con permiso de configurar la agenda debe darlos de alta antes de agendar.</p>
      }
      <form [formGroup]="form" class="form">
        @if (moving; as current) {
          <p class="fixed wide"><strong>{{ current.patientName }}</strong> · {{ current.serviceTypeName ?? 'Servicio' }} · {{ laneName(current.equipmentId) }}</p>
        } @else {
          @if (contact(); as chosen) {
            <p class="fixed wide">
              <span><strong>{{ chosen.name }}</strong>@if (chosen.phone) { · {{ chosen.phone }} }</span>
              <button mat-button type="button" (click)="contact.set(null)">Cambiar paciente</button>
            </p>
          } @else {
            <mat-form-field appearance="outline">
              <mat-label>Nombre del paciente</mat-label>
              <input matInput formControlName="patientName" maxlength="160" autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Teléfono (opcional)</mat-label>
              <input matInput type="tel" formControlName="patientPhone" maxlength="30" autocomplete="off" />
            </mat-form-field>
            @if (matches().length > 0) {
              <div class="wide matches">
                <p>¿Ya lo tienes registrado? Elígelo para ligar sus citas.</p>
                <ul>
                  @for (match of matches(); track match.id) {
                    <li><button mat-stroked-button type="button" (click)="contact.set(match)">{{ match.name }}@if (match.phone) { · {{ match.phone }} }</button></li>
                  }
                </ul>
              </div>
            }
          }

          <mat-form-field appearance="outline">
            <mat-label>Servicio</mat-label>
            <mat-select formControlName="serviceTypeId">
              @for (service of data.services; track service.id) {
                <mat-option [value]="service.id">{{ service.name }} · {{ service.durationMinutes }} min</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Equipo</mat-label>
            <mat-select formControlName="equipmentId">
              @for (lane of equipment(); track lane.id) {
                <mat-option [value]="lane.id">{{ lane.name }}</mat-option>
              }
            </mat-select>
            @if (service() && equipment().length === 0) { <mat-hint>Ningún equipo de este establecimiento hace ese servicio</mat-hint> }
          </mat-form-field>
          @if (service()?.preparation; as preparation) {
            <div class="wide preparation">
              <strong>Indicaciones para el paciente</strong>
              <p>{{ preparation }}</p>
            </div>
          }
        }

        <mat-form-field appearance="outline">
          <mat-label>Fecha</mat-label>
          <input matInput type="date" formControlName="date" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Hora</mat-label>
          <input matInput type="time" formControlName="clock" />
        </mat-form-field>

        @if (error()) { <p class="error wide" role="alert"><mat-icon aria-hidden="true">error</mat-icon> {{ error() }}</p> }

        @if (slotsReady()) {
          <div class="wide slots">
            @if (slots().length > 0) {
              <p id="slots-label">Horas libres</p>
              <div class="chips" role="group" aria-labelledby="slots-label">
                @for (slot of slots(); track slot.startsAt) {
                  <button type="button" class="chip" [class.on]="clockOfSlot(slot) === clock()" [attr.aria-pressed]="clockOfSlot(slot) === clock()" (click)="choose(slot)">{{ clockOfSlot(slot) }}</button>
                }
              </div>
            } @else {
              <p>No quedan horas libres ese día en este equipo. Una urgencia puede agendarse fuera de horario.</p>
            }
          </div>
        }

        @if (!moving) {
          <mat-checkbox formControlName="urgent" class="wide">Urgente (puede ir fuera del horario del equipo)</mat-checkbox>
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Notas (opcional)</mat-label>
            <textarea matInput rows="2" formControlName="notes" maxlength="2000"></textarea>
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ moving ? 'No mover' : 'Cancelar' }}</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!canSave() || saving()">
        {{ saving() ? 'Guardando…' : moving ? 'Mover cita' : 'Agendar cita' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; margin-top: 8px; }
    .wide { grid-column: 1 / -1; }
    .fixed { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; font-size: 15px; }
    .matches, .preparation, .slots { margin: -4px 0 16px; font-size: 14px; color: #334155; }
    .matches p, .slots p { margin: 0 0 8px; }
    .matches ul { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; }
    .preparation { padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .preparation p { margin: 4px 0 0; white-space: pre-line; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; max-height: 132px; overflow-y: auto; }
    .chip { min-width: 64px; min-height: 40px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font: inherit; font-size: 14px; font-variant-numeric: tabular-nums; color: #0f172a; cursor: pointer; }
    .chip:hover { background: #f1f5f9; }
    .chip.on { border-color: #2563c9; background: #2563c9; color: #fff; font-weight: 600; }
    .chip:focus-visible { outline: 2px solid #2563c9; outline-offset: 2px; }
    .error { display: flex; align-items: flex-start; gap: 8px; margin: -4px 0 16px; color: #b91c1c; font-size: 14px; }
    .error mat-icon { flex: none; font-size: 20px; width: 20px; height: 20px; }
    @media (max-width: 640px) { .form { grid-template-columns: 1fr; } .chip { min-height: 44px; } }
  `],
})
export class BookAppointmentDialogComponent {
  readonly data = inject<BookAppointmentData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<BookAppointmentDialogComponent, AgendaBooked>);
  private readonly api = inject(AgendaApiService);

  readonly moving = this.data.rescheduling ?? null;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly contact = signal<AgendaContact | null>(this.data.contact ?? null);

  readonly form = inject(FormBuilder).nonNullable.group({
    patientName: [''],
    patientPhone: [''],
    serviceTypeId: [this.moving?.serviceTypeId ?? ''],
    equipmentId: [this.moving?.equipmentId ?? this.data.equipmentId ?? ''],
    date: [this.data.date],
    clock: [this.data.clock ?? ''],
    urgent: [false],
    notes: [''],
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });

  readonly clock = computed(() => this.value().clock);
  readonly service = computed<AgendaServiceType | null>(() => this.data.services.find((s) => s.id === this.value().serviceTypeId) ?? null);
  /** Al reprogramar el equipo no cambia; al agendar, los de la modalidad del servicio (todos mientras no haya servicio). */
  readonly equipment = computed<AgendaLane[]>(() => (this.moving ? this.data.lanes.filter((lane) => lane.id === this.moving?.equipmentId) : lanesFor(this.service(), this.data.lanes)));

  /**
   * Lo que define qué horas libres pedir, como texto: así escribir el nombre o
   * las notas no las vuelve a pedir. Vacío mientras falte algo.
   */
  private readonly slotsKey = computed(() => {
    const { equipmentId, serviceTypeId, date } = this.value();
    return equipmentId && serviceTypeId && LOCAL_DATE.test(date) ? [equipmentId, serviceTypeId, date].join('|') : '';
  });
  private readonly refreshes = signal(0);
  readonly slotsReady = signal(false);
  readonly slots = signal<AgendaSlot[]>([]);

  /** Contactos parecidos al nombre que se está escribiendo. */
  readonly matches = toSignal(
    this.form.controls.patientName.valueChanges.pipe(
      map((name) => name.trim()),
      debounceTime(SEARCH_AFTER_MS),
      distinctUntilChanged(),
      switchMap((name) => (name.length >= SEARCH_MIN_LENGTH ? this.api.contacts(name).pipe(catchError(() => of<AgendaContact[]>([]))) : of<AgendaContact[]>([]))),
    ),
    { initialValue: [] as AgendaContact[] },
  );

  constructor() {
    // Si el equipo elegido no hace el servicio, se cambia al único posible o se vacía.
    toObservable(this.equipment)
      .pipe(takeUntilDestroyed())
      .subscribe((options) => {
        // Sin servicio aún no se sabe qué equipos caben: se respeta el del carril donde se hizo clic.
        if (!this.moving && !this.service()) return;
        const control = this.form.controls.equipmentId;
        if (options.some((lane) => lane.id === control.value)) return;
        control.setValue(options.length === 1 ? options[0].id : '');
      });

    let shownFor = '';
    toObservable(computed(() => `${this.slotsKey()}#${this.refreshes()}`))
      .pipe(
        switchMap(() => {
          const key = this.slotsKey();
          // Otro equipo, servicio o fecha: las horas de antes ya no valen. Un simple refresco las deja a la vista.
          if (key !== shownFor) this.slotsReady.set(false);
          shownFor = key;
          if (!key) return of(null);
          const [equipmentId, serviceTypeId, date] = key.split('|');
          return this.api.slots({ equipmentId, serviceTypeId, date }).pipe(map((result) => result.slots), catchError(() => of(null)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((slots) => {
        this.slots.set(slots ?? []);
        this.slotsReady.set(slots !== null);
      });
  }

  laneName(equipmentId: string): string {
    return this.data.lanes.find((lane) => lane.id === equipmentId)?.name ?? 'Equipo';
  }

  clockOfSlot(slot: AgendaSlot): string {
    return clockOf(slot.startsAt, this.data.timeZone);
  }

  /** Elegir un hueco pone su hora y borra el aviso de choque anterior. */
  choose(slot: AgendaSlot): void {
    this.form.controls.clock.setValue(this.clockOfSlot(slot));
    this.error.set(null);
  }

  canSave(): boolean {
    const { patientName, serviceTypeId, equipmentId, date, clock } = this.value();
    const patient = this.moving !== null || this.contact() !== null || patientName.trim().length > 0;
    return patient && !!serviceTypeId && !!equipmentId && LOCAL_DATE.test(date) && CLOCK.test(clock);
  }

  save(): void {
    if (this.saving() || !this.canSave()) return;
    const form = this.form.getRawValue();
    const startsAt = instantAt(form.date, form.clock, this.data.timeZone);
    const request = this.moving
      ? this.api.reschedule(this.moving.id, { startsAt })
      : this.api.book(bookingOf({ ...form, startsAt, contact: this.contact(), durationMinutes: null }));
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (booked) => this.ref.close(booked),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const conflict = err.status === CONFLICT && (err.error as AgendaConflict | null)?.code ? (err.error as AgendaConflict) : null;
        this.error.set(conflict ? conflictMessage(conflict, this.data.timeZone) : apiMessage(err));
        // Tras un choque las horas libres ya cambiaron.
        if (conflict) this.refreshes.update((n) => n + 1);
      },
    });
  }
}
