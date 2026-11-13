import { AgendaWeekHour } from '../../core/models/agenda.models';
import { blockSpan, copyDayToWeek, flattenWeek, weekProblem, weekRows } from './settings.helpers';

const hour = (weekday: number, opensAt: string, closesAt: string): AgendaWeekHour => ({ weekday, opensAt, closesAt });

describe('horario semanal de un equipo', () => {
  it('ordena la semana de lunes a domingo y deja vacíos los días sin horario', () => {
    const rows = weekRows([hour(0, '09:00', '13:00'), hour(1, '08:00', '14:00'), hour(1, '16:00', '20:00')]);

    expect(rows.map((row) => row.label)).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    expect(rows[0].intervals).toEqual([{ opensAt: '08:00', closesAt: '14:00' }, { opensAt: '16:00', closesAt: '20:00' }]);
    expect(rows[1].intervals).toEqual([]);
    expect(rows[6].intervals).toEqual([{ opensAt: '09:00', closesAt: '13:00' }]);
  });

  it('el cierre a medianoche se captura como 00:00 y se guarda como 24:00', () => {
    const rows = weekRows([hour(1, '00:00', '24:00')]);
    expect(rows[0].intervals).toEqual([{ opensAt: '00:00', closesAt: '00:00' }]);
    expect(flattenWeek(rows)).toEqual([hour(1, '00:00', '24:00')]);
  });

  it('al guardar manda un tramo por renglón con su día', () => {
    const rows = weekRows([hour(2, '08:00', '14:00'), hour(0, '09:00', '13:00')]);
    expect(flattenWeek(rows)).toEqual([hour(2, '08:00', '14:00'), hour(0, '09:00', '13:00')]);
  });

  it('copia el horario de un día a toda la semana', () => {
    const rows = copyDayToWeek(weekRows([hour(1, '08:00', '14:00')]), 1);
    expect(rows.every((row) => row.intervals.length === 1 && row.intervals[0].opensAt === '08:00')).toBeTrue();
    rows[0].intervals[0].opensAt = '09:00';
    expect(rows[1].intervals[0].opensAt).toBe('08:00');
  });
});

describe('weekProblem', () => {
  it('un horario correcto no tiene problema, tampoco con tramos contiguos', () => {
    expect(weekProblem(weekRows([hour(1, '08:00', '14:00'), hour(1, '14:00', '20:00'), hour(2, '00:00', '24:00')]))).toBeNull();
  });

  it('avisa de un tramo sin hora', () => {
    const rows = weekRows([hour(1, '08:00', '14:00')]);
    rows[2].intervals.push({ opensAt: '', closesAt: '12:00' });
    expect(weekProblem(rows)).toBe('Miércoles: falta la hora de apertura o de cierre.');
  });

  it('avisa si la apertura no es anterior al cierre', () => {
    expect(weekProblem(weekRows([hour(4, '14:00', '08:00')]))).toBe('Jueves: la apertura (14:00) debe ser anterior al cierre (08:00).');
  });

  it('avisa si dos tramos del mismo día se enciman', () => {
    expect(weekProblem(weekRows([hour(6, '08:00', '14:00'), hour(6, '13:00', '18:00')]))).toBe('Sábado: los tramos 08:00–14:00 y 13:00–18:00 se enciman.');
  });
});

describe('blockSpan', () => {
  const MX = 'America/Mexico_City';

  it('en un mismo día dice la fecha una vez', () => {
    expect(blockSpan({ startsAt: '2026-12-07T22:00:00.000Z', endsAt: '2026-12-08T00:00:00.000Z' }, MX)).toBe('lun 7 dic, 16:00 a 18:00');
  });

  it('si cruza días dice las dos fechas', () => {
    expect(blockSpan({ startsAt: '2026-12-07T22:00:00.000Z', endsAt: '2026-12-09T15:00:00.000Z' }, MX)).toBe('lun 7 dic, 16:00 a mié 9 dic, 09:00');
  });
});
