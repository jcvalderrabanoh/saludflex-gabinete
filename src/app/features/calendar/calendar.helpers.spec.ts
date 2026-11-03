import { Appointment, EvaluatedObligation } from '../../core/models/facility.models';
import { addDays, calendarEntriesByDay, monthGrid, monthRange, upcomingEntries } from './calendar.helpers';

const obligation = (patch: Partial<EvaluatedObligation>): EvaluatedObligation =>
  ({ id: 'o1', catalogKey: 'cofepris.licencia-rx', title: 'Licencia RX', status: 'due-soon', dueOn: '2026-11-20', subjectLabel: null, ...patch }) as EvaluatedObligation;

const appointment = (patch: Partial<Appointment>): Appointment => ({
  id: 'a1',
  establishmentId: 'e1',
  obligationId: null,
  kind: 'service',
  title: 'Fumigación',
  scheduledOn: '2026-11-15',
  startTime: '10:00',
  location: null,
  notes: null,
  state: 'scheduled',
  ...patch,
});

describe('monthGrid', () => {
  it('noviembre de 2026 empieza en domingo: la cuadrícula arranca el lunes 26 de octubre y cubre semanas completas', () => {
    const days = monthGrid(2026, 10);
    expect(days[0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(days.find((d) => d.date === '2026-11-01')?.inMonth).toBe(true);
    expect(days.length % 7).toBe(0);
    expect(days.at(-1)).toEqual({ date: '2026-12-06', inMonth: false });
  });

  it('febrero bisiesto tiene 29 días dentro del mes', () => {
    expect(monthGrid(2028, 1).filter((d) => d.inMonth)).toHaveSize(29);
  });
});

describe('monthRange', () => {
  it('va del primer al último día de la cuadrícula visible', () => {
    expect(monthRange(2026, 10)).toEqual({ from: '2026-10-26', to: '2026-12-06' });
  });
});

describe('calendarEntriesByDay', () => {
  it('junta vencimientos y citas por día, citas ordenadas por hora y vencimientos primero', () => {
    const byDay = calendarEntriesByDay(
      [obligation({ dueOn: '2026-11-15', title: 'Licencia RX' }), obligation({ id: 'o2', dueOn: null })],
      [appointment({ id: 'a2', startTime: '12:00', title: 'Visita' }), appointment({})],
    );
    expect(byDay.get('2026-11-15')?.map((e) => e.title)).toEqual(['Licencia RX', 'Fumigación', 'Visita']);
    expect(byDay.size).toBe(1);
  });

  it('el vencimiento lleva el sujeto en el título', () => {
    const byDay = calendarEntriesByDay([obligation({ subjectLabel: 'Téc. Ana López' })], []);
    expect(byDay.get('2026-11-20')?.[0].title).toBe('Licencia RX · Téc. Ana López');
  });

  it('las vigentes sin aviso no saturan el calendario: solo entran las que están por vencer o vencidas', () => {
    const byDay = calendarEntriesByDay([obligation({ status: 'ok' }), obligation({ id: 'o3', status: 'overdue' })], []);
    expect(byDay.get('2026-11-20')?.map((e) => e.id)).toEqual(['o3']);
  });
});


describe('addDays', () => {
  it('cruza meses y años', () => {
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('upcomingEntries', () => {
  it('sin fecha de hoy (el estado aún no llega) no lista nada ni truena', () => {
    expect(upcomingEntries('', [obligation({})], [appointment({})])).toEqual([]);
  });


  it('lista por fecha lo de hoy a 30 días, más lo vencido que sigue pendiente', () => {
    const entries = upcomingEntries(
      '2026-11-03',
      [
        obligation({ id: 'late', status: 'overdue', dueOn: '2026-10-20', title: 'Dosimetría' }),
        obligation({ id: 'soon', dueOn: '2026-11-20' }),
        obligation({ id: 'far', dueOn: '2026-12-20' }),
      ],
      [appointment({ scheduledOn: '2026-11-15' }), appointment({ id: 'past', scheduledOn: '2026-10-01' })],
    );
    expect(entries.map((e) => e.id)).toEqual(['late', 'a1', 'soon']);
  });
});
