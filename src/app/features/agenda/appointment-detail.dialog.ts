import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AgendaAppointment, AgendaLane, AgendaServiceType } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { STATE_VIEWS, clockOf } from './agenda.helpers';
import { otherAppointmentsOf } from './booking.helpers';

export interface AppointmentDetailData {
  appointment: AgendaAppointment;
  lane: AgendaLane;
  /** Equipos del establecimiento, para ver las otras citas del paciente ese día. */
  lanes: AgendaLane[];
  services: AgendaServiceType[];
  /** Con `facility.schedule.manage`; sin él, el detalle es de solo lectura. */
  canManage: boolean;
}

/** 409: ya cambió de estado; 404: ya no existe. */
const STALE_STATUSES = [409, 404];

/** `changed`: la cita cambió de estado y hay que recargar; `reschedule`: abrir el diálogo para moverla. */
export type AppointmentDetailResult = 'changed' | 'reschedule';

/** Detalle de una cita, con la acción que sigue según su estado. Se abre como panel a la derecha. */
@Component({
  selector: 'app-appointment-detail-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ appointment.patientName }}</h2>
    <mat-dialog-content>
      <p class="state" [class]="'state ' + appointment.state">
        <mat-icon aria-hidden="true">{{ state.icon }}</mat-icon> {{ state.label }}
        @if (appointment.priority === 'urgent') { <span class="urgent"><mat-icon aria-hidden="true">priority_high</mat-icon> Urgente</span> }
      </p>

      <dl>
        <dt>Hora</dt>
        <dd>{{ time }}</dd>
        <dt>Equipo</dt>
        <dd>{{ data.lane.name }}@if (data.lane.room) { · {{ data.lane.room }} }</dd>
        <dt>Servicio</dt>
        <dd>{{ appointment.serviceTypeName ?? 'Sin dato' }}</dd>
        <dt>Teléfono</dt>
        <dd>
          @if (appointment.patientPhone) { <a [href]="'tel:' + appointment.patientPhone">{{ appointment.patientPhone }}</a> } @else { Sin dato }
        </dd>
        @if (arrivedAt) {
          <dt>Llegó</dt>
          <dd>{{ arrivedAt }}</dd>
        }
        @if (appointment.notes) {
          <dt>Notas</dt>
          <dd class="pre">{{ appointment.notes }}</dd>
        }
        @if (appointment.cancelReason) {
          <dt>Motivo de la cancelación</dt>
          <dd>{{ appointment.cancelReason }}</dd>
        }
      </dl>

      @if (preparation) {
        <h3>Indicaciones para el paciente</h3>
        <p class="pre">{{ preparation }}</p>
      }

      @if (others.length > 0) {
        <h3>Otras citas del paciente este día</h3>
        <ul class="others">
          @for (other of others; track other.appointment.id) {
            <li>{{ clock(other.appointment.startsAt) }} · {{ other.lane.name }} · {{ views[other.appointment.state].label }}</li>
          }
        </ul>
      }

      @if (cancelling()) {
        <div class="confirm">
          <p>¿Cancelar la cita de {{ appointment.patientName }}? El horario queda libre.</p>
          <mat-form-field appearance="outline">
            <mat-label>Motivo (opcional)</mat-label>
            <input matInput [formControl]="reason" maxlength="255" />
          </mat-form-field>
        </div>
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>

    <mat-dialog-actions>
      @if (cancelling()) {
        <button mat-button (click)="cancelling.set(false)" [disabled]="busy()">No cancelar</button>
        <button mat-flat-button class="danger" (click)="run(api.cancel(appointment.id, reason.value.trim() || null))" [disabled]="busy()">Sí, cancelar la cita</button>
      } @else {
        @if (canAct() && appointment.state === 'scheduled') {
          <button mat-flat-button color="primary" (click)="run(api.arrive(appointment.id))" [disabled]="busy()"><mat-icon>how_to_reg</mat-icon> Marcar llegada</button>
          <button mat-stroked-button (click)="reschedule()" [disabled]="busy()">Reprogramar</button>
          <button mat-stroked-button (click)="run(api.noShow(appointment.id))" [disabled]="busy()">No se presentó</button>
        }
        @if (canAct() && appointment.state === 'arrived') {
          <button mat-flat-button color="primary" (click)="run(api.attend(appointment.id))" [disabled]="busy()"><mat-icon>done_all</mat-icon> Marcar atendida</button>
        }
        @if (canAct() && canCancel) {
          <button mat-button class="danger-text" (click)="cancelling.set(true)" [disabled]="busy()">Cancelar cita</button>
        }
        <button mat-button class="close" (click)="close()">Cerrar</button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .state { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; font-weight: 600; color: #334155; }
    .state mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .state.arrived { color: #166534; }
    .state.attended { color: #5b6b80; }
    .state.no_show, .state.cancelled, .urgent { color: #b91c1c; }
    .urgent { display: inline-flex; align-items: center; margin-left: 12px; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; font-size: 15px; }
    dt { color: #526077; }
    dd { margin: 0; color: #0f172a; overflow-wrap: anywhere; }
    h3 { margin: 20px 0 4px; font-size: 14px; font-weight: 600; color: #334155; }
    .pre { margin: 0; white-space: pre-line; }
    .others { margin: 0; padding-left: 18px; font-size: 14px; }
    .confirm { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
    .confirm p { margin: 0 0 12px; font-weight: 600; }
    .confirm mat-form-field { width: 100%; }
    .error { margin: 12px 0 0; color: #b91c1c; font-size: 14px; }
    mat-dialog-actions { flex-wrap: wrap; gap: 8px; }
    .close { margin-left: auto; }
    .danger { background: #b91c1c; color: #fff; }
    .danger-text { color: #b91c1c; }
  `],
})
export class AppointmentDetailDialogComponent {
  readonly data = inject<AppointmentDetailData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AppointmentDetailDialogComponent, AppointmentDetailResult>);
  readonly api = inject(AgendaApiService);

  readonly appointment = this.data.appointment;
  readonly views = STATE_VIEWS;
  readonly state = STATE_VIEWS[this.appointment.state];
  readonly time = `${this.clock(this.appointment.startsAt)}–${this.clock(this.appointment.endsAt)}`;
  readonly arrivedAt = this.appointment.arrivedAt ? this.clock(this.appointment.arrivedAt) : null;
  readonly preparation = this.data.services.find((service) => service.id === this.appointment.serviceTypeId)?.preparation ?? null;
  readonly others = otherAppointmentsOf(this.appointment, this.data.lanes);
  readonly canCancel = this.appointment.state === 'scheduled' || this.appointment.state === 'arrived';

  readonly reason = new FormControl('', { nonNullable: true });
  readonly cancelling = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** La cita ya no está como se muestra: se quitan las acciones y al cerrar se recarga la agenda. */
  private readonly outdated = signal(false);
  readonly canAct = computed(() => this.data.canManage && !this.outdated());

  clock(instant: string): string {
    return clockOf(instant, this.data.lane.timeZone);
  }

  reschedule(): void {
    this.ref.close('reschedule');
  }

  close(): void {
    this.ref.close(this.outdated() ? 'changed' : undefined);
  }

  /** Cualquier cambio de estado: si entra, se cierra y la agenda se recarga. */
  run(action: Observable<AgendaAppointment>): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    action.subscribe({
      next: () => this.ref.close('changed'),
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.cancelling.set(false);
        this.error.set(apiMessage(err));
        // Alguien más ya movió o cerró esta cita: lo que se ve aquí es viejo.
        if (STALE_STATUSES.includes(err.status)) {
          this.outdated.set(true);
          this.ref.disableClose = true;
        }
      },
    });
  }
}
