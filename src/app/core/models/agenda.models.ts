/** Modelos de la agenda de estudios (módulo `scheduling` de jc-core). */

export type AgendaAppointmentState = 'scheduled' | 'arrived' | 'attended' | 'no_show' | 'cancelled';
export type AgendaPriority = 'normal' | 'urgent';

/** Una cita: un servicio, en un equipo, a una hora. Los instantes van en ISO con zona. */
export interface AgendaAppointment {
  id: string;
  equipmentId: string;
  serviceTypeId: string;
  /** Nombre del servicio, aunque ya no esté en el catálogo. */
  serviceTypeName: string | null;
  /** Contacto del paciente; `null` en citas anteriores a los contactos. */
  patientContactId: string | null;
  startsAt: string;
  endsAt: string;
  state: AgendaAppointmentState;
  priority: AgendaPriority;
  patientName: string;
  patientPhone: string | null;
  notes: string | null;
  arrivedAt: string | null;
  cancelReason: string | null;
}

/** Un lapso en que el equipo no se agenda. */
export interface AgendaBlock {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}

/** Tramo del horario de un equipo ese día, en horas locales `HH:MM` (cierre hasta 24:00). */
export interface AgendaHours {
  opensAt: string;
  closesAt: string;
}

/** El carril de un equipo en un día, leído en la zona de su establecimiento. */
export interface AgendaLane {
  id: string;
  establishmentId: string;
  name: string;
  modality: string;
  room: string | null;
  timeZone: string;
  dayStartsAt: string;
  dayEndsAt: string;
  hours: AgendaHours[];
  blocks: AgendaBlock[];
  appointments: AgendaAppointment[];
}

export interface AgendaDay {
  /** Fecha local `AAAA-MM-DD`. */
  date: string;
  resources: AgendaLane[];
}

/** Algo que se puede agendar: fija la modalidad del equipo y la duración de la cita. */
export interface AgendaServiceType {
  id: string;
  name: string;
  modality: string;
  durationMinutes: number;
  /** Indicaciones para decirle al paciente. */
  preparation: string | null;
}

export interface AgendaContact {
  id: string;
  name: string;
  phone: string | null;
}

export interface AgendaSlot {
  startsAt: string;
  endsAt: string;
}

export interface AgendaSlots {
  date: string;
  timeZone: string;
  durationMinutes: number;
  slots: AgendaSlot[];
}

export interface AgendaSlotsQuery {
  equipmentId: string;
  serviceTypeId: string;
  date: string;
  durationMinutes?: number;
}

/** Para agendar va un contacto existente o el nombre (y teléfono) de uno nuevo. */
export interface AgendaBooking {
  equipmentId: string;
  serviceTypeId: string;
  startsAt: string;
  durationMinutes?: number;
  priority?: AgendaPriority;
  patientContactId?: string;
  patientName?: string;
  patientPhone?: string | null;
  notes?: string | null;
}

export interface AgendaReschedule {
  startsAt: string;
  durationMinutes?: number;
}

/** El mismo paciente ya tiene otra cita que ocupa ese lapso. Avisa, no bloquea. */
export interface AgendaPatientOverlap {
  code: 'PATIENT_OVERLAP';
  appointment: { id: string; equipmentId: string; startsAt: string; endsAt: string };
}

export type AgendaBooked = AgendaAppointment & { warnings: AgendaPatientOverlap[] };

/** Cuerpo de un 409 al agendar: con qué choca. */
export interface AgendaConflict {
  message: string;
  code: 'APPOINTMENT_OVERLAP' | 'RESOURCE_BLOCKED';
  conflict?: { id: string; startsAt: string; endsAt: string } | null;
  block?: { id: string; startsAt: string; endsAt: string; reason: string };
}
