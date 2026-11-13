import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AgendaAppointment, AgendaLane } from '../../core/models/agenda.models';
import { HourMark, Place, StateView } from './agenda.helpers';

export interface PlacedAppointment {
  appointment: AgendaAppointment;
  place: Place;
  start: string;
  end: string;
  state: StateView;
  /** El servicio solo se escribe si en el carril hay más de uno y la cita tiene alto para dos líneas. */
  service: string | null;
  /** Lo que escucha un lector de pantalla: hora, paciente, servicio, urgencia y estado. */
  label: string;
}

export interface PlacedBand {
  id: string;
  place: Place;
  text: string;
}

export interface LaneView {
  lane: AgendaLane;
  count: number;
  /** «09:00–22:15», de la primera a la última cita; `null` sin citas. */
  range: string | null;
  closed: PlacedBand[];
  blocks: PlacedBand[];
  appointments: PlacedAppointment[];
}

/** Alto a partir del cual una franja cerrada o bloqueada lleva su rótulo. */
const BAND_LABEL_HEIGHT = 20;

/** El carril de un equipo: horas fuera de horario, bloqueos, hora actual y citas. */
@Component({
  selector: 'app-agenda-lane',
  standalone: true,
  imports: [MatIconModule],
  host: { role: 'group', '[attr.aria-label]': 'view().lane.name' },
  template: `
    @for (mark of marks(); track mark.minutes) {
      <div class="rule" [class.half]="!mark.onTheHour" [style.top.px]="mark.top" aria-hidden="true"></div>
    }
    @for (band of view().closed; track band.id) {
      <div class="band closed" [style.top.px]="band.place.top" [style.height.px]="band.place.height">
        @if (band.place.height >= labelHeight) { <span>{{ band.text }}</span> }
      </div>
    }
    @for (band of view().blocks; track band.id) {
      <div class="band blocked" [style.top.px]="band.place.top" [style.height.px]="band.place.height" [attr.title]="band.text">
        @if (band.place.height >= labelHeight) { <span><mat-icon aria-hidden="true">block</mat-icon> {{ band.text }}</span> }
      </div>
    }
    @if (nowTop() !== null) {
      <div class="now" [style.top.px]="nowTop()" aria-hidden="true"></div>
    }
    <ul role="list">
      @for (item of view().appointments; track item.appointment.id) {
        <li class="appointment" [class]="'appointment ' + item.appointment.state" [class.urgent]="item.appointment.priority === 'urgent'" [style.top.px]="item.place.top" [style.height.px]="item.place.height">
          <span class="visually-hidden">{{ item.label }}</span>
          <div class="line" aria-hidden="true">
            <span class="time">{{ item.start }}<span class="end">–{{ item.end }}</span></span>
            <span class="patient">{{ item.appointment.patientName }}</span>
            @if (item.appointment.priority === 'urgent') {
              <span class="tag" title="Urgente"><mat-icon>priority_high</mat-icon><span class="wide">Urgente</span></span>
            }
            <span class="state" [attr.title]="item.state.label"><mat-icon>{{ item.state.icon }}</mat-icon><span class="wide">{{ item.state.label }}</span></span>
          </div>
          @if (item.service) { <div class="service" aria-hidden="true">{{ item.service }}</div> }
        </li>
      }
    </ul>
  `,
  styles: [`
    :host { position: relative; display: block; container-type: inline-size; border-left: 1px solid #e2e8f0; scroll-snap-align: start; }
    ul { list-style: none; margin: 0; padding: 0; }
    .rule { position: absolute; left: 0; right: 0; border-top: 1px solid #e2e8f0; }
    .rule.half { border-top-color: #f1f5f9; }
    /* clip y no hidden: así el rótulo puede quedarse pegado al desplazar la parrilla. */
    .band { position: absolute; left: 0; right: 0; overflow: clip; font-size: 12px; color: #526077; }
    .band span, .line { position: sticky; top: var(--head); }
    .band span { display: flex; align-items: center; gap: 4px; padding: 2px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .closed { background: #f1f5f9; }
    .blocked { z-index: 1; background: repeating-linear-gradient(135deg, #fef3c7 0 8px, #fde9a8 8px 16px); color: #713f12; font-weight: 600; }
    .now { position: absolute; left: 0; right: 0; z-index: 1; border-top: 2px solid #2563c9; }

    .appointment {
      position: absolute; left: 4px; right: 4px; z-index: 2; box-sizing: border-box; overflow: clip;
      padding: 0 8px; border: 1px solid #cbd5e1; border-left: 4px solid #334155; border-radius: 6px; background: #fff; font-size: 13px;
    }
    .line { display: flex; align-items: center; gap: 8px; height: 20px; line-height: 20px; }
    .time { flex: none; font-variant-numeric: tabular-nums; color: #334155; }
    .patient { flex: 1; min-width: 3ch; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .state, .tag { flex: none; display: inline-flex; align-items: center; gap: 2px; font-size: 12px; white-space: nowrap; }
    mat-icon { flex: none; font-size: 16px; width: 16px; height: 16px; }
    .tag { color: #b91c1c; font-weight: 700; }
    .service { font-size: 12px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .urgent { border-left-color: #b91c1c; }
    .arrived { background: #ecfdf5; border-color: #86efac; border-left-color: #15803d; }
    .arrived .state { color: #166534; font-weight: 700; }
    .attended { background: #f8fafc; border-left-color: #94a3b8; }
    .attended .time, .attended .patient, .attended .state { color: #5b6b80; font-weight: 400; }
    .no_show { border-style: dashed; border-left-style: solid; border-left-color: #94a3b8; }
    .no_show .patient { color: #5b6b80; font-weight: 400; text-decoration: line-through; }
    .no_show .state { color: #b91c1c; }
    /* Carril angosto: el nombre manda. Primero se va la hora de fin (el alto ya la dice), luego los textos de urgencia y estado, que quedan en su icono. */
    @container (max-width: 400px) { .end, .tag .wide { display: none; } }
    @container (max-width: 300px) { .wide { display: none; } }
  `],
})
export class AgendaLaneComponent {
  readonly view = input.required<LaneView>();
  readonly marks = input.required<HourMark[]>();
  readonly nowTop = input<number | null>(null);
  readonly labelHeight = BAND_LABEL_HEIGHT;
}
