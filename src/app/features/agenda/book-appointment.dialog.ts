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
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap, tap } from 'rxjs';
import { EquipmentModality } from '../../core/models/facility.models';
import { MODALITY_LABELS } from '../../core/models/labels';
import { AgendaAppointment, AgendaBooked, AgendaConflict, AgendaContact, AgendaLane, AgendaServiceType, AgendaSlot } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { AgendaCatalogService } from './agenda-catalog.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { clockOf } from './agenda.helpers';
import { bookingOf, conflictMessage, instantAt, lanesFor } from './booking.helpers';
import { noPlaceText } from './settings.helpers';

export interface BookAppointmentData {
  /** Fecha local propuesta: el día que se está viendo. */
  date: string;
  timeZone: string;
  /** El establecimiento elegido: ahí se agregan servicios y equipos desde las listas. */
  establishmentId: string;
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

/** Valor de la opción «Agregar…» al final de una lista: abre el alta en vez de elegir. */
export const ADD_NEW = '__add__';

const modalityLabel = (modality: string): string => MODALITY_LABELS[modality as EquipmentModality] ?? modality;

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
      @if (!moving && services().length === 0) {
        <p class="error" role="alert">
          <mat-icon aria-hidden="true">error</mat-icon>
          @if (canEditServices) {
            <span>Aún no hay servicios en el catálogo. <button mat-stroked-button type="button" (click)="addService()">Agregar servicio</button></span>
          } @else {
            <span>Aún no hay servicios en el catálogo. Alguien con permiso de configurar la agenda debe darlos de alta antes de agendar.</span>
          }
        </p>
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

          <div class="pick">
            <mat-form-field appearance="outline">
              <mat-label>Servicio</mat-label>
              <mat-select formControlName="serviceTypeId" (selectionChange)="pickService($event.value)">
                @for (service of services(); track service.id) {
                  <mat-option [value]="service.id">{{ service.name }} · {{ service.durationMinutes }} min</mat-option>
                }
                @if (canEditServices) {
                  <mat-option [value]="addNew" class="add-new"><mat-icon aria-hidden="true">add</mat-icon>Agregar servicio…</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (canEditServices && service(); as chosen) {
              <button mat-icon-button type="button" (click)="editService(chosen)" [attr.aria-label]="'Editar servicio ' + chosen.name"><mat-icon>edit</mat-icon></button>
            }
          </div>
          <div class="pick">
            <mat-form-field appearance="outline">
              <mat-label>Equipo</mat-label>
              <mat-select formControlName="equipmentId" (selectionChange)="pickEquipment($event.value)">
                @for (lane of equipment(); track lane.id) {
                  <mat-option [value]="lane.id">{{ lane.name }}</mat-option>
                }
                @if (canEditEquipment) {
                  <mat-option [value]="addNew" class="add-new"><mat-icon aria-hidden="true">add</mat-icon>Agregar equipo…</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (canEditEquipment && chosenLane(); as lane) {
              <button mat-icon-button type="button" (click)="editEquipment(lane)" [attr.aria-label]="'Editar equipo ' + lane.name"><mat-icon>edit</mat-icon></button>
            }
          </div>
          @if (service(); as chosen) {
            @if (!moving && equipment().length === 0) {
              <p class="wide no-place" role="status">
                <mat-icon aria-hidden="true">warning</mat-icon>
                @if (canEditEquipment) {
                  <span>{{ noPlace(chosen) }} <button mat-stroked-button type="button" (click)="addEquipment()">Agregar equipo de {{ modalityName(chosen) }}</button></span>
                } @else {
                  <span>{{ noPlace(chosen) }} Pide a quien administra la agenda que agregue uno para poder agendar este servicio.</span>
                }
              </p>
            }
          }
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
    .pick { display: flex; align-items: flex-start; gap: 4px; min-width: 0; }
    .pick mat-form-field { flex: 1; min-width: 0; }
    .pick button { margin-top: 4px; }
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
    .no-place { display: flex; align-items: flex-start; gap: 8px; margin: -4px 0 16px; padding: 12px; border-radius: 8px; background: #fff3d6; color: #5c4000; font-size: 14px; }
    .no-place mat-icon { flex: none; color: #805800; font-size: 20px; width: 20px; height: 20px; }
    .no-place button, .error button { margin-top: 8px; display: block; }
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
  private readonly catalog = inject(AgendaCatalogService);
  readonly canEditServices = this.catalog.canEditServices();
  readonly canEditEquipment = this.catalog.canEditEquipment();
  readonly addNew = ADD_NEW;
  /** Copias que crecen al agregar o editar desde las listas. */
  readonly services = signal<AgendaServiceType[]>(this.data.services);
  private readonly lanes = signal<AgendaLane[]>(this.data.lanes);

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
  readonly service = computed<AgendaServiceType | null>(() => this.services().find((s) => s.id === this.value().serviceTypeId) ?? null);
  /** Al reprogramar el equipo no cambia; al agendar, los de la modalidad del servicio (todos mientras no haya servicio). */
  readonly equipment = computed<AgendaLane[]>(() => (this.moving ? this.lanes().filter((lane) => lane.id === this.moving?.equipmentId) : lanesFor(this.service(), this.lanes())));
  readonly chosenLane = computed(() => this.equipment().find((lane) => lane.id === this.value().equipmentId) ?? null);

  /**
   * Lo que define qué horas libres pedir, como texto: así escribir el nombre o
   * las notas no las vuelve a pedir. Vacío mientras falte algo.
   */
  private readonly slotsKey = computed(() => {
    const { equipmentId, serviceTypeId, date } = this.value();
    return equipmentId && serviceTypeId && equipmentId !== ADD_NEW && serviceTypeId !== ADD_NEW && LOCAL_DATE.test(date) ? [equipmentId, serviceTypeId, date].join('|') : '';
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

  /** Lo último elegido de verdad en cada lista, para volver a ello si se cancela un «Agregar…». */
  private readonly lastPicked = { service: this.form.controls.serviceTypeId.value, equipment: this.form.controls.equipmentId.value };

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(({ serviceTypeId, equipmentId }) => {
      if (serviceTypeId !== undefined && serviceTypeId !== ADD_NEW) this.lastPicked.service = serviceTypeId;
      if (equipmentId !== undefined && equipmentId !== ADD_NEW) this.lastPicked.equipment = equipmentId;
    });
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

  noPlace(service: AgendaServiceType): string {
    return noPlaceText(service.modality);
  }

  modalityName(service: AgendaServiceType): string {
    return modalityLabel(service.modality);
  }

  laneName(equipmentId: string): string {
    return this.lanes().find((lane) => lane.id === equipmentId)?.name ?? 'Equipo';
  }

  /** «Agregar servicio…» no es un servicio: se vuelve al que estaba y se abre el alta. */
  pickService(value: string): void {
    if (value !== ADD_NEW) return;
    this.form.controls.serviceTypeId.setValue(this.lastPicked.service);
    this.addService();
  }

  pickEquipment(value: string): void {
    if (value !== ADD_NEW) return;
    this.form.controls.equipmentId.setValue(this.lastPicked.equipment);
    this.addEquipment();
  }

  addService(): void {
    this.catalog.addService(this.data.establishmentId, this.lanes()).subscribe((saved) => {
      this.services.update((list) => [...list, saved]);
      this.form.controls.serviceTypeId.setValue(saved.id);
    });
  }

  editService(service: AgendaServiceType): void {
    this.catalog.editService(service, this.data.establishmentId, this.lanes()).subscribe((saved) => this.services.update((list) => list.map((s) => (s.id === saved.id ? saved : s))));
  }

  /** El equipo nuevo llega como carril del día, con su horario: se vuelve a leer el día. */
  addEquipment(): void {
    this.catalog
      .addEquipment(this.data.establishmentId, this.service()?.modality)
      .pipe(switchMap((result) => this.reloadLanes().pipe(map(() => result))))
      .subscribe((result) => this.equipment().some((lane) => lane.id === result.equipmentId) && this.form.controls.equipmentId.setValue(result.equipmentId));
  }

  editEquipment(lane: AgendaLane): void {
    this.catalog.editEquipment(this.data.establishmentId, lane).pipe(switchMap(() => this.reloadLanes())).subscribe();
  }

  /** Con la fecha a medio escribir se lee el día que se estaba viendo. */
  private reloadLanes(): Observable<AgendaLane[]> {
    const { date } = this.value();
    return this.api.day(LOCAL_DATE.test(date) ? date : this.data.date).pipe(
      map((day) => day.resources.filter((lane) => lane.establishmentId === this.data.establishmentId)),
      tap((lanes) => this.lanes.set(lanes)),
      catchError(() => of([])),
    );
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
