import { AppointmentKind, AppointmentUpdate } from '../../core/models/facility.models';

export interface AppointmentForm {
  obligationId: string;
  title: string;
  kind: AppointmentKind;
  scheduledOn: string;
  startTime: string;
  location: string;
  notes: string;
}

/**
 * Cambios de una cita editada: los opcionales vacíos van como `null` (se
 * borran); el título vacío no se manda (el backend lo exige y conserva el anterior).
 */
export function toAppointmentUpdate(form: AppointmentForm): AppointmentUpdate {
  const orNull = (value: string) => value.trim() || null;
  return {
    ...(form.title.trim() && { title: form.title.trim() }),
    kind: form.kind,
    scheduledOn: form.scheduledOn,
    obligationId: form.obligationId || null,
    startTime: form.startTime || null,
    location: orNull(form.location),
    notes: orNull(form.notes),
  };
}
