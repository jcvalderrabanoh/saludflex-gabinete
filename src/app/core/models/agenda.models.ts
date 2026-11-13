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
