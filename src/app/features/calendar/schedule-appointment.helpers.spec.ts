import { toAppointmentUpdate } from './schedule-appointment.helpers';

describe('toAppointmentUpdate', () => {
  const form = {
    obligationId: 'o1',
    title: ' Fumigación ',
    kind: 'service' as const,
    scheduledOn: '2026-11-27',
    startTime: '09:30',
    location: 'Proveedor',
    notes: 'Llamar antes',
  };

  it('manda los campos con valor, sin espacios de sobra', () => {
    expect(toAppointmentUpdate(form)).toEqual({ ...form, title: 'Fumigación' });
  });

  it('un campo opcional vacío se manda como null para borrarlo', () => {
    expect(toAppointmentUpdate({ ...form, obligationId: '', startTime: '', location: '  ', notes: '' })).toEqual({
      title: 'Fumigación',
      kind: 'service',
      scheduledOn: '2026-11-27',
      obligationId: null,
      startTime: null,
      location: null,
      notes: null,
    });
  });

  it('sin título no lo manda: el backend conserva el anterior', () => {
    expect(toAppointmentUpdate({ ...form, title: '' })).not.toEqual(jasmine.objectContaining({ title: jasmine.anything() }));
  });
});
