import { AgendaAppointment, AgendaBooking, AgendaConflict, AgendaContact, AgendaLane, AgendaPatientOverlap, AgendaServiceType } from '../../core/models/agenda.models';
import { clockOf } from './agenda.helpers';

/** Al hacer clic en la parrilla, la hora se ajusta a múltiplos de esto. */
const SNAP_MINUTES = 5;

/** Cuánto va adelantada la hora local de la zona respecto a UTC en ese instante. */
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - Math.floor(instant / 1000) * 1000;
}

/** El instante (ISO) en que el reloj del establecimiento marca esa hora de ese día. */
export function instantAt(date: string, clock: string, timeZone: string): string {
  const wallClock = Date.parse(`${date}T${clock}:00Z`);
  const firstGuess = wallClock - offsetMs(wallClock, timeZone);
  // Segunda pasada: el desfase puede cambiar ese mismo día (horario de verano).
  return new Date(wallClock - offsetMs(firstGuess, timeZone)).toISOString();
}

export function snapMinutes(minutes: number): number {
  return Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/** Los equipos donde cabe el servicio: los de su modalidad. */
export function lanesFor(service: AgendaServiceType | null, lanes: readonly AgendaLane[]): AgendaLane[] {
  return service ? lanes.filter((lane) => lane.modality === service.modality) : [];
}

export interface BookingForm {
  equipmentId: string;
  serviceTypeId: string;
  startsAt: string;
  /** Contacto elegido en la búsqueda; `null` si se captura un paciente nuevo. */
  contact: AgendaContact | null;
  patientName: string;
  patientPhone: string;
  urgent: boolean;
  notes: string;
  /** Solo si difiere de la duración del servicio. */
  durationMinutes: number | null;
}

/** Lo que se manda a jc-core: un contacto existente o un paciente nuevo, nunca los dos. */
export function bookingOf(form: BookingForm): AgendaBooking {
  const notes = form.notes.trim();
  return {
    equipmentId: form.equipmentId,
    serviceTypeId: form.serviceTypeId,
    startsAt: form.startsAt,
    ...(form.contact ? { patientContactId: form.contact.id } : { patientName: form.patientName.trim(), patientPhone: form.patientPhone.trim() || null }),
    ...(form.urgent ? { priority: 'urgent' as const } : {}),
    ...(notes ? { notes } : {}),
    ...(form.durationMinutes ? { durationMinutes: form.durationMinutes } : {}),
  };
}

const span = (range: { startsAt: string; endsAt: string }, timeZone: string): string => `de ${clockOf(range.startsAt, timeZone)} a ${clockOf(range.endsAt, timeZone)}`;

const UNAVAILABLE = 'Ese horario no está disponible. Elige otro.';

/**
 * El 409 de jc-core, dicho para recepción: con qué choca y a qué hora.
 * `conflict: null` es la carrera (la base rechazó y ya no se sabe con cuál).
 * Si el detalle no llegó, se usa el mensaje del servidor, que ya dice el motivo.
 */
export function conflictMessage(conflict: AgendaConflict, timeZone: string): string {
  if (conflict.code === 'RESOURCE_BLOCKED' && conflict.block) {
    return `El equipo está bloqueado ${span(conflict.block, timeZone)}: ${conflict.block.reason}.`;
  }
  if (conflict.conflict) return `Ese horario ya está ocupado por otra cita ${span(conflict.conflict, timeZone)}. Elige otro.`;
  if (conflict.conflict === null) return 'Ese horario se acaba de ocupar. Elige otro.';
  return conflict.message?.trim() || UNAVAILABLE;
}

/** Aviso, no bloqueo: el paciente ya tiene otra cita en ese lapso. */
export function overlapWarning(warnings: readonly AgendaPatientOverlap[], lanes: readonly AgendaLane[], timeZone: string): string | null {
  if (warnings.length === 0) return null;
  const others = warnings.map(({ appointment }) => {
    const equipment = lanes.find((lane) => lane.id === appointment.equipmentId)?.name;
    return `${clockOf(appointment.startsAt, timeZone)}${equipment ? ` en ${equipment}` : ''}`;
  });
  return `Este paciente ya tiene otra cita a esa hora: ${others.join(', ')}.`;
}

export interface LaneAppointment {
  appointment: AgendaAppointment;
  lane: AgendaLane;
}

/** Las otras citas vigentes del mismo paciente ese día, por hora. */
export function otherAppointmentsOf(appointment: AgendaAppointment, lanes: readonly AgendaLane[]): LaneAppointment[] {
  if (!appointment.patientContactId) return [];
  return lanes
    .flatMap((lane) => lane.appointments.map((other) => ({ appointment: other, lane })))
    .filter(({ appointment: other }) => other.id !== appointment.id && other.patientContactId === appointment.patientContactId && other.state !== 'cancelled')
    .sort((a, b) => a.appointment.startsAt.localeCompare(b.appointment.startsAt));
}
