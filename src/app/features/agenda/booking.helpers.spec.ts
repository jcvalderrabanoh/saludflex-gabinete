import { AgendaAppointment, AgendaConflict, AgendaLane, AgendaServiceType } from '../../core/models/agenda.models';
import { bookingOf, conflictMessage, instantAt, lanesFor, otherAppointmentsOf, overlapWarning, snapMinutes } from './booking.helpers';

const MX = 'America/Mexico_City';

const lane = (patch: Partial<AgendaLane> = {}): AgendaLane => ({
  id: 'ct',
  establishmentId: 'est',
  name: 'Tomógrafo',
  modality: 'ct',
  room: null,
  timeZone: MX,
  dayStartsAt: '2026-12-07T06:00:00.000Z',
  dayEndsAt: '2026-12-08T06:00:00.000Z',
  hours: [],
  blocks: [],
  appointments: [],
  ...patch,
});

const appointment = (patch: Partial<AgendaAppointment> = {}): AgendaAppointment => ({
  id: 'a1',
  equipmentId: 'ct',
  serviceTypeId: 's1',
  serviceTypeName: 'Tomografía simple',
  patientContactId: 'c1',
  startsAt: '2026-12-07T15:00:00.000Z',
  endsAt: '2026-12-07T15:05:00.000Z',
  state: 'scheduled',
  priority: 'normal',
  patientName: 'María López',
  patientPhone: null,
  notes: null,
  arrivedAt: null,
  cancelReason: null,
  ...patch,
});

const service = (patch: Partial<AgendaServiceType> = {}): AgendaServiceType => ({ id: 's1', name: 'Tomografía simple', modality: 'ct', durationMinutes: 5, preparation: null, ...patch });

describe('instantAt', () => {
  it('convierte fecha y hora del establecimiento al instante real', () => {
    expect(instantAt('2026-12-07', '09:00', MX)).toBe('2026-12-07T15:00:00.000Z');
    expect(instantAt('2026-12-07', '09:00', 'America/Tijuana')).toBe('2026-12-07T17:00:00.000Z');
  });

  it('respeta el horario de verano de la zona', () => {
    // Tijuana: UTC−8 en invierno, UTC−7 en verano.
    expect(instantAt('2027-07-01', '09:00', 'America/Tijuana')).toBe('2027-07-01T16:00:00.000Z');
  });

  it('las 23:30 siguen siendo de ese día', () => {
    expect(instantAt('2026-12-07', '23:30', MX)).toBe('2026-12-08T05:30:00.000Z');
  });
});

describe('snapMinutes', () => {
  it('lleva el punto donde se hizo clic al múltiplo de 5 minutos anterior', () => {
    expect(snapMinutes(543.7)).toBe(540);
    expect(snapMinutes(549.9)).toBe(545);
  });
});

describe('lanesFor', () => {
  it('ofrece solo los equipos de la modalidad del servicio', () => {
    const lanes = [lane(), lane({ id: 'rx', name: 'Rayos X', modality: 'xray' }), lane({ id: 'ct2', name: 'Tomógrafo 2' })];
    expect(lanesFor(service(), lanes).map((l) => l.id)).toEqual(['ct', 'ct2']);
    expect(lanesFor(null, lanes)).toEqual([]);
  });
});

describe('bookingOf', () => {
  const base = { equipmentId: 'ct', serviceTypeId: 's1', startsAt: '2026-12-07T15:00:00.000Z', urgent: false, notes: '', durationMinutes: null };

  it('con un contacto elegido manda solo su id', () => {
    expect(bookingOf({ ...base, contact: { id: 'c1', name: 'María López', phone: '55' }, patientName: 'otra cosa', patientPhone: '' })).toEqual({
      equipmentId: 'ct',
      serviceTypeId: 's1',
      startsAt: '2026-12-07T15:00:00.000Z',
      patientContactId: 'c1',
    });
  });

  it('con un paciente nuevo manda nombre y teléfono; vacío es sin teléfono', () => {
    expect(bookingOf({ ...base, contact: null, patientName: ' Pedro Ramírez ', patientPhone: ' ' })).toEqual({
      equipmentId: 'ct',
      serviceTypeId: 's1',
      startsAt: '2026-12-07T15:00:00.000Z',
      patientName: 'Pedro Ramírez',
      patientPhone: null,
    });
  });

  it('agrega urgencia, notas y duración solo cuando se dieron', () => {
    const booking = bookingOf({ ...base, contact: null, patientName: 'Pedro', patientPhone: '55 1234', urgent: true, notes: ' Trae estudios ', durationMinutes: 45 });
    expect(booking).toEqual(jasmine.objectContaining({ priority: 'urgent', notes: 'Trae estudios', durationMinutes: 45, patientPhone: '55 1234' }));
  });
});

describe('conflictMessage', () => {
  it('dice con qué cita choca y a qué hora', () => {
    const conflict: AgendaConflict = { message: 'x', code: 'APPOINTMENT_OVERLAP', conflict: { id: 'a1', startsAt: '2026-12-07T15:00:00.000Z', endsAt: '2026-12-07T15:15:00.000Z' } };
    expect(conflictMessage(conflict, MX)).toBe('Ese horario ya está ocupado por otra cita de 09:00 a 09:15. Elige otro.');
  });

  it('si ya no se sabe con cuál, lo dice sin hora', () => {
    expect(conflictMessage({ message: 'x', code: 'APPOINTMENT_OVERLAP', conflict: null }, MX)).toBe('Ese horario se acaba de ocupar. Elige otro.');
  });

  it('un bloqueo dice su motivo y su horario', () => {
    const conflict: AgendaConflict = { message: 'x', code: 'RESOURCE_BLOCKED', block: { id: 'b', startsAt: '2026-12-07T22:00:00.000Z', endsAt: '2026-12-08T00:00:00.000Z', reason: 'Mantenimiento' } };
    expect(conflictMessage(conflict, MX)).toBe('El equipo está bloqueado de 16:00 a 18:00: Mantenimiento.');
  });
});

describe('avisos del mismo paciente', () => {
  it('dice a qué hora y en qué equipo tiene la otra cita', () => {
    const lanes = [lane(), lane({ id: 'rx', name: 'Rayos X' })];
    const warning = { code: 'PATIENT_OVERLAP' as const, appointment: { id: 'a9', equipmentId: 'rx', startsAt: '2026-12-07T15:00:00.000Z', endsAt: '2026-12-07T15:30:00.000Z' } };
    expect(overlapWarning([warning], lanes, MX)).toBe('Este paciente ya tiene otra cita a esa hora: 09:00 en Rayos X.');
    expect(overlapWarning([], lanes, MX)).toBeNull();
  });

  it('lista las otras citas vigentes del paciente ese día, por hora', () => {
    const mine = appointment();
    const later = appointment({ id: 'a2', equipmentId: 'rx', startsAt: '2026-12-07T17:00:00.000Z', endsAt: '2026-12-07T17:30:00.000Z' });
    const cancelled = appointment({ id: 'a3', state: 'cancelled' });
    const stranger = appointment({ id: 'a4', patientContactId: 'c2' });
    const lanes = [lane({ appointments: [mine, cancelled, stranger] }), lane({ id: 'rx', name: 'Rayos X', appointments: [later] })];

    expect(otherAppointmentsOf(mine, lanes).map((item) => [item.appointment.id, item.lane.name])).toEqual([['a2', 'Rayos X']]);
    expect(otherAppointmentsOf(appointment({ patientContactId: null }), lanes)).toEqual([]);
  });
});
