import { Appointment, DateRange, EvaluatedObligation } from '../../core/models/facility.models';

export interface CalendarDay {
  date: string;
  /** Falso para los días del mes anterior o siguiente que completan la semana. */
  inMonth: boolean;
}

/** Dónde cae el día dentro de la franja del plazo, para unir los extremos. */
export type WindowSegment = 'start' | 'middle' | 'end' | 'single';

export type CalendarEntry =
  | { type: 'due'; id: string; title: string; obligation: EvaluatedObligation }
  | {
      type: 'window';
      id: string;
      title: string;
      obligation: EvaluatedObligation;
      segment: WindowSegment;
      /** El título va al empezar la franja y al empezar cada semana; el resto del tramo es solo color. */
      showTitle: boolean;
    }
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

const obligationTitle = (obligation: EvaluatedObligation) =>
  [obligation.title, obligation.subjectLabel].filter(Boolean).join(' · ');

/** El plazo sin pagar es lo que manda en el calendario: la franja ya marca la fecha B. */
const unpaidWindow = (obligation: EvaluatedObligation) => (obligation.window && !obligation.window.paid ? obligation.window : null);

const isMonday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

/**
 * Vencimientos, plazos y citas agrupados por fecha. De los vencimientos solo
 * entran los que piden atención (por vencer o vencidos); los vigentes llenarían
 * el mes de ruido. Un plazo sin pagar se pinta como franja de A a B, primero en
 * cada día para que la franja quede alineada.
 */
export function calendarEntriesByDay(
  obligations: EvaluatedObligation[],
  appointments: Appointment[],
): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  const add = (date: string, entry: CalendarEntry) => byDay.set(date, [...(byDay.get(date) ?? []), entry]);
  for (const obligation of obligations) {
    const window = unpaidWindow(obligation);
    if (!window) continue;
    const title = obligationTitle(obligation);
    for (let date = window.startsOn; date <= window.endsOn; date = addDays(date, 1)) {
      const first = date === window.startsOn;
      const last = date === window.endsOn;
      const segment: WindowSegment = first && last ? 'single' : first ? 'start' : last ? 'end' : 'middle';
      add(date, { type: 'window', id: obligation.id, title, obligation, segment, showTitle: first || isMonday(date) });
    }
  }
  for (const obligation of obligations) {
    if (unpaidWindow(obligation)) continue;
    if (!obligation.dueOn || (obligation.status !== 'due-soon' && obligation.status !== 'overdue')) continue;
    add(obligation.dueOn, { type: 'due', id: obligation.id, title: obligationTitle(obligation), obligation });
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
 * Un plazo sale una sola vez, con su fecha B, si abre dentro de esos 30 días.
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
      if (entry.type === 'window') continue;
      const overdue = entry.type === 'due' && entry.obligation.status === 'overdue';
      if ((date >= today || overdue) && date <= until) entries.push({ ...entry, date });
    }
  }
  for (const obligation of obligations) {
    const window = unpaidWindow(obligation);
    if (!window || window.startsOn > until) continue;
    entries.push({ type: 'window', id: obligation.id, title: obligationTitle(obligation), obligation, segment: 'single', showTitle: true, date: window.endsOn });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
