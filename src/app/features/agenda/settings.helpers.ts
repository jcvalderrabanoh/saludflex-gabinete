import { AgendaWeekHour } from '../../core/models/agenda.models';
import { clockOf } from './agenda.helpers';

export interface DayInterval {
  opensAt: string;
  closesAt: string;
}

export interface WeekRow {
  /** 0 es domingo y 6 es sábado, como en jc-core. */
  weekday: number;
  label: string;
  intervals: DayInterval[];
}

/** La semana como la lee recepción: de lunes a domingo. */
const WEEK: readonly [number, string][] = [
  [1, 'Lunes'],
  [2, 'Martes'],
  [3, 'Miércoles'],
  [4, 'Jueves'],
  [5, 'Viernes'],
  [6, 'Sábado'],
  [0, 'Domingo'],
];

/** jc-core guarda el cierre a medianoche como 24:00; un campo de hora solo llega a 23:59, así que se captura 00:00. */
const MIDNIGHT_STORED = '24:00';
const MIDNIGHT_TYPED = '00:00';

const closing = (interval: DayInterval): string => (interval.closesAt === MIDNIGHT_TYPED ? MIDNIGHT_STORED : interval.closesAt);

export function weekRows(hours: readonly AgendaWeekHour[]): WeekRow[] {
  return WEEK.map(([weekday, label]) => ({
    weekday,
    label,
    intervals: hours
      .filter((h) => h.weekday === weekday)
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
      .map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt === MIDNIGHT_STORED ? MIDNIGHT_TYPED : h.closesAt })),
  }));
}

export function flattenWeek(rows: readonly WeekRow[]): AgendaWeekHour[] {
  return rows.flatMap((row) => row.intervals.map((interval) => ({ weekday: row.weekday, opensAt: interval.opensAt, closesAt: closing(interval) })));
}

export function copyDayToWeek(rows: readonly WeekRow[], weekday: number): WeekRow[] {
  const source = rows.find((row) => row.weekday === weekday)?.intervals ?? [];
  return rows.map((row) => ({ ...row, intervals: source.map((interval) => ({ ...interval })) }));
}

/** Lo primero que impide guardar el horario, dicho con el día; `null` si está bien. Mismas reglas que jc-core. */
export function weekProblem(rows: readonly WeekRow[]): string | null {
  for (const row of rows) {
    if (row.intervals.some((interval) => !interval.opensAt || !interval.closesAt)) return `${row.label}: falta la hora de apertura o de cierre.`;
    const sorted = row.intervals.map((interval) => ({ opensAt: interval.opensAt, closesAt: closing(interval) })).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    for (const [index, interval] of sorted.entries()) {
      if (interval.opensAt >= interval.closesAt) return `${row.label}: la apertura (${interval.opensAt}) debe ser anterior al cierre (${interval.closesAt}).`;
      const previous = sorted[index - 1];
      if (previous && interval.opensAt < previous.closesAt) {
        return `${row.label}: los tramos ${previous.opensAt}–${previous.closesAt} y ${interval.opensAt}–${interval.closesAt} se enciman.`;
      }
    }
  }
  return null;
}

function shortDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(instant));
  const part = (type: string) => (parts.find((p) => p.type === type)?.value ?? '').replace('.', '');
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}

/** «lun 7 dic, 16:00 a 18:00», en la zona del establecimiento. */
export function blockSpan(block: { startsAt: string; endsAt: string }, timeZone: string): string {
  const from = `${shortDate(block.startsAt, timeZone)}, ${clockOf(block.startsAt, timeZone)}`;
  const sameDay = shortDate(block.startsAt, timeZone) === shortDate(block.endsAt, timeZone);
  return `${from} a ${sameDay ? '' : `${shortDate(block.endsAt, timeZone)}, `}${clockOf(block.endsAt, timeZone)}`;
}
