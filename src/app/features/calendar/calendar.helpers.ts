import { Appointment, DateRange, EvaluatedObligation } from '../../core/models/facility.models';

export interface CalendarDay {
  date: string;
  /** Falso para los días del mes anterior o siguiente que completan la semana. */
  inMonth: boolean;
}

export type CalendarEntry =
  | { type: 'due'; id: string; title: string; obligation: EvaluatedObligation }
  | { type: 'appointment'; id: string; title: string; appointment: Appointment };

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

/** Fechas locales AAAA-MM-DD calculadas en UTC: el calendario no depende de la zona del navegador. */
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Semanas completas (de lunes a domingo) que cubren el mes; `month` va de 0 a 11. */
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = Date.UTC(year, month, 1);
  const last = Date.UTC(year, month + 1, 0);
  const mondayOffset = (new Date(first).getUTCDay() + 6) % DAYS_PER_WEEK;
  const sundayOffset = (DAYS_PER_WEEK - 1 - ((new Date(last).getUTCDay() + 6) % DAYS_PER_WEEK)) % DAYS_PER_WEEK;
  const days: CalendarDay[] = [];
  for (let ms = first - mondayOffset * MS_PER_DAY; ms <= last + sundayOffset * MS_PER_DAY; ms += MS_PER_DAY) {
    days.push({ date: isoDate(ms), inMonth: ms >= first && ms <= last });
  }
  return days;
}

/** El rango que se le pide a la API: lo visible en la cuadrícula, no solo el mes. */
export function monthRange(year: number, month: number): DateRange {
  const days = monthGrid(year, month);
  return { from: days[0].date, to: days[days.length - 1].date };
}

/**
 * Vencimientos y citas agrupados por fecha. Solo entran los vencimientos que
 * piden atención (por vencer o vencidos); los vigentes llenarían el mes de ruido.
 */
export function calendarEntriesByDay(
  obligations: EvaluatedObligation[],
  appointments: Appointment[],
): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  const add = (date: string, entry: CalendarEntry) => byDay.set(date, [...(byDay.get(date) ?? []), entry]);
  for (const obligation of obligations) {
    if (!obligation.dueOn || (obligation.status !== 'due-soon' && obligation.status !== 'overdue')) continue;
    const title = [obligation.title, obligation.subjectLabel].filter(Boolean).join(' · ');
    add(obligation.dueOn, { type: 'due', id: obligation.id, title, obligation });
  }
  const byTime = [...appointments].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  for (const appointment of byTime) {
    add(appointment.scheduledOn, { type: 'appointment', id: appointment.id, title: appointment.title, appointment });
  }
  return byDay;
}

export const UPCOMING_DAYS = 30;

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return isoDate(Date.UTC(y, m - 1, d) + days * MS_PER_DAY);
}

/**
 * El panel «Próximos 30 días»: citas y vencimientos de hoy a 30 días, más lo
 * vencido que sigue sin registro nuevo (no desaparece por pasar de fecha).
 */
export function upcomingEntries(
  today: string,
  obligations: EvaluatedObligation[],
  appointments: Appointment[],
): Array<CalendarEntry & { date: string }> {
  if (!today) return [];
  const until = addDays(today, UPCOMING_DAYS);
  const entries: Array<CalendarEntry & { date: string }> = [];
  for (const [date, list] of calendarEntriesByDay(obligations, appointments)) {
    for (const entry of list) {
      const overdue = entry.type === 'due' && entry.obligation.status === 'overdue';
      if ((date >= today || overdue) && date <= until) entries.push({ ...entry, date });
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
