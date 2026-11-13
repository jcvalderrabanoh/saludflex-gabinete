import { AgendaAppointment, AgendaAppointmentState, AgendaBlock, AgendaLane } from '../../core/models/agenda.models';

/** Minutos desde la medianoche local. */
export interface MinuteRange {
  from: number;
  to: number;
}

export interface HourMark {
  minutes: number;
  label: string;
  onTheHour: boolean;
}

export interface Place {
  top: number;
  height: number;
}

export interface DaySummary {
  total: number;
  arrived: number;
  attended: number;
  urgent: number;
  noShow: number;
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Zona para calcular «hoy» antes de conocer la del establecimiento. */
export const DEFAULT_TIME_ZONE = 'America/Mexico_City';

/** Jornada que se muestra cuando ningún equipo tiene horario ni citas. */
const DEFAULT_WINDOW: MinuteRange = { from: 7 * MINUTES_PER_HOUR, to: 20 * MINUTES_PER_HOUR };
const MARK_EVERY_MINUTES = 30;

/** Alto mínimo de una cita para que quepa una línea de texto. */
const MIN_APPOINTMENT_HEIGHT = 22;
const MIN_PIXELS_PER_MINUTE = 1.6;
const MAX_PIXELS_PER_MINUTE = 4.4;

/** Estados que ocupan el equipo; los demás liberan el hueco. */
const OCCUPYING: readonly AgendaAppointmentState[] = ['scheduled', 'arrived', 'attended'];

const pad = (value: number): string => String(value).padStart(2, '0');

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** La fecha `AAAA-MM-DD` que es «hoy» en esa zona. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** «Lunes 7 de diciembre de 2026». */
export function longDate(date: string): string {
  const parts = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = part('weekday');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${part('day')} de ${part('month')} de ${part('year')}`;
}

/** La hora `HH:MM` de un instante, leída en una zona horaria. */
export function clockOf(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));
}

export function minutesOfClock(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

export function clockOfMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`;
}

/** Minutos de la hora actual en la zona del equipo; `null` si el día mostrado no es hoy. */
export function nowMinutes(lane: AgendaLane, date: string, now = new Date()): number | null {
  return todayIn(lane.timeZone, now) === date ? minutesOfClock(clockOf(now, lane.timeZone)) : null;
}

const durationMinutes = (range: { startsAt: string; endsAt: string }): number => (Date.parse(range.endsAt) - Date.parse(range.startsAt)) / MS_PER_MINUTE;

/** Inicio y fin de una cita en minutos del día; lo que pasa de medianoche se corta. */
function appointmentRange(appointment: AgendaAppointment, lane: AgendaLane): MinuteRange {
  const from = minutesOfClock(clockOf(appointment.startsAt, lane.timeZone));
  return { from, to: Math.min(from + durationMinutes(appointment), MINUTES_PER_DAY) };
}

const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }): boolean => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * Las citas que se pintan en el carril. Las canceladas no; quien no se
 * presentó sí, salvo que otra cita ya haya tomado ese hueco.
 */
export function gridAppointments(lane: AgendaLane): AgendaAppointment[] {
  const occupying = lane.appointments.filter((a) => OCCUPYING.includes(a.state));
  return lane.appointments.filter((a) => OCCUPYING.includes(a.state) || (a.state === 'no_show' && !occupying.some((other) => overlaps(a, other))));
}

/** De la primera apertura al último cierre, estirada por las citas fuera de horario, a horas completas. */
export function gridWindow(lanes: readonly AgendaLane[]): MinuteRange {
  const ranges: MinuteRange[] = lanes.flatMap((lane) => [
    ...lane.hours.map((h) => ({ from: minutesOfClock(h.opensAt), to: minutesOfClock(h.closesAt) })),
    ...gridAppointments(lane).map((a) => appointmentRange(a, lane)),
  ]);
  if (ranges.length === 0) return DEFAULT_WINDOW;
  const from = Math.min(...ranges.map((r) => r.from));
  const to = Math.max(...ranges.map((r) => r.to));
  return { from: Math.floor(from / MINUTES_PER_HOUR) * MINUTES_PER_HOUR, to: Math.ceil(to / MINUTES_PER_HOUR) * MINUTES_PER_HOUR };
}

export function hourMarks(window: MinuteRange): HourMark[] {
  const marks: HourMark[] = [];
  for (let minutes = window.from; minutes < window.to; minutes += MARK_EVERY_MINUTES) {
    marks.push({ minutes, label: clockOfMinutes(minutes), onTheHour: minutes % MINUTES_PER_HOUR === 0 });
  }
  return marks;
}

/** Escala vertical: la cita más corta del día debe poder leerse en una línea. */
export function pixelsPerMinute(lanes: readonly AgendaLane[]): number {
  const durations = lanes.flatMap((lane) => gridAppointments(lane).map(durationMinutes)).filter((d) => d > 0);
  if (durations.length === 0) return MIN_PIXELS_PER_MINUTE;
  return Math.min(MAX_PIXELS_PER_MINUTE, Math.max(MIN_PIXELS_PER_MINUTE, MIN_APPOINTMENT_HEIGHT / Math.min(...durations)));
}

function placeOf(range: MinuteRange, window: MinuteRange, scale: number): Place | null {
  const from = Math.max(range.from, window.from);
  const to = Math.min(range.to, window.to);
  return to > from ? { top: (from - window.from) * scale, height: (to - from) * scale } : null;
}

export function appointmentPlace(appointment: AgendaAppointment, lane: AgendaLane, window: MinuteRange, scale: number): Place | null {
  return placeOf(appointmentRange(appointment, lane), window, scale);
}

/** Un bloqueo puede empezar antes o terminar después del día: se pinta solo lo que cae en él. */
export function blockPlace(block: AgendaBlock, lane: AgendaLane, window: MinuteRange, scale: number): Place | null {
  const from = block.startsAt <= lane.dayStartsAt ? 0 : minutesOfClock(clockOf(block.startsAt, lane.timeZone));
  const to = block.endsAt >= lane.dayEndsAt ? MINUTES_PER_DAY : minutesOfClock(clockOf(block.endsAt, lane.timeZone));
  return placeOf({ from, to }, window, scale);
}

export function bandPlace(band: MinuteRange, window: MinuteRange, scale: number): Place | null {
  return placeOf(band, window, scale);
}

/** Lo que queda de la ventana fuera del horario del equipo. */
export function closedBands(lane: AgendaLane, window: MinuteRange): MinuteRange[] {
  const open = lane.hours.map((h) => ({ from: minutesOfClock(h.opensAt), to: minutesOfClock(h.closesAt) })).sort((a, b) => a.from - b.from);
  const bands: MinuteRange[] = [];
  let cursor = window.from;
  for (const interval of open) {
    if (interval.from > cursor) bands.push({ from: cursor, to: Math.min(interval.from, window.to) });
    cursor = Math.max(cursor, interval.to);
  }
  if (cursor < window.to) bands.push({ from: cursor, to: window.to });
  return bands.filter((band) => band.to > band.from);
}

export function daySummary(lanes: readonly AgendaLane[]): DaySummary {
  const all = lanes.flatMap((lane) => lane.appointments).filter((a) => a.state !== 'cancelled');
  const count = (state: AgendaAppointmentState) => all.filter((a) => a.state === state).length;
  return { total: all.length, arrived: count('arrived'), attended: count('attended'), urgent: all.filter((a) => a.priority === 'urgent').length, noShow: count('no_show') };
}

export interface StateView {
  label: string;
  icon: string;
}

/** Un icono y un texto por estado, los mismos en toda la agenda. */
export const STATE_VIEWS: Record<AgendaAppointmentState, StateView> = {
  scheduled: { label: 'Programada', icon: 'schedule' },
  arrived: { label: 'Llegó', icon: 'how_to_reg' },
  attended: { label: 'Atendida', icon: 'done_all' },
  no_show: { label: 'No se presentó', icon: 'person_off' },
  cancelled: { label: 'Cancelada', icon: 'event_busy' },
};
