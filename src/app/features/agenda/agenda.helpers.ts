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
  top: number;
}

/**
 * El eje vertical del día. No es lineal: los tramos largos en que ningún
 * equipo trabaja se pliegan a una franja corta para no desplazar en vacío.
 */
export interface DayAxis {
  window: MinuteRange;
  height: number;
  marks: HourMark[];
  folds: MinuteRange[];
  /** Distancia en píxeles desde el inicio de la ventana hasta ese minuto. */
  top(minutes: number): number;
  /** El minuto que cae a esa distancia; dentro de un tramo plegado, su inicio. */
  minutesAt(top: number): number;
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

/** Un tramo sin actividad se pliega si dura al menos esto. */
const FOLD_FROM_MINUTES = 180;
/** Alto de un tramo plegado: cabe su rótulo. */
const FOLD_HEIGHT = 36;

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
 * presentó sí, salvo que otra cita ya haya tomado ese hueco (o que después
 * haya otra ausencia en él: se pinta la última).
 */
export function gridAppointments(lane: AgendaLane): AgendaAppointment[] {
  const occupies = (a: AgendaAppointment) => OCCUPYING.includes(a.state);
  const occupying = lane.appointments.filter(occupies);
  return lane.appointments.filter((a, index) => {
    if (occupies(a)) return true;
    if (a.state !== 'no_show' || occupying.some((other) => overlaps(a, other))) return false;
    return !lane.appointments.some((other, later) => later > index && other.state === 'no_show' && overlaps(a, other));
  });
}

/** Lo que un bloqueo ocupa del día, en minutos; puede empezar antes o terminar después. */
function blockRange(block: AgendaBlock, lane: AgendaLane): MinuteRange {
  return {
    from: block.startsAt <= lane.dayStartsAt ? 0 : minutesOfClock(clockOf(block.startsAt, lane.timeZone)),
    to: block.endsAt >= lane.dayEndsAt ? MINUTES_PER_DAY : minutesOfClock(clockOf(block.endsAt, lane.timeZone)),
  };
}

/** Horario, citas y los bloqueos que empiezan ese día: lo que la parrilla debe dejar ver. */
function activeRanges(lane: AgendaLane): MinuteRange[] {
  return [
    ...lane.hours.map((h) => ({ from: minutesOfClock(h.opensAt), to: minutesOfClock(h.closesAt) })),
    ...gridAppointments(lane).map((a) => appointmentRange(a, lane)),
    ...lane.blocks.filter((block) => block.startsAt > lane.dayStartsAt).map((block) => blockRange(block, lane)),
  ];
}

const toHours = (range: MinuteRange): MinuteRange => ({
  from: Math.floor(range.from / MINUTES_PER_HOUR) * MINUTES_PER_HOUR,
  to: Math.ceil(range.to / MINUTES_PER_HOUR) * MINUTES_PER_HOUR,
});

/** De la primera apertura al último cierre, estirada por citas y bloqueos fuera de horario, a horas completas. */
export function gridWindow(lanes: readonly AgendaLane[]): MinuteRange {
  const ranges = lanes.flatMap(activeRanges);
  if (ranges.length === 0) return DEFAULT_WINDOW;
  return toHours({ from: Math.min(...ranges.map((r) => r.from)), to: Math.max(...ranges.map((r) => r.to)) });
}

/** Tramos de la ventana, de al menos tres horas, en que ningún equipo tiene horario, citas ni bloqueos. */
function foldsOf(lanes: readonly AgendaLane[], window: MinuteRange): MinuteRange[] {
  const busy = lanes.flatMap(activeRanges).map(toHours).sort((a, b) => a.from - b.from);
  const folds: MinuteRange[] = [];
  let cursor = window.from;
  for (const range of busy) {
    if (range.from - cursor >= FOLD_FROM_MINUTES) folds.push({ from: cursor, to: range.from });
    cursor = Math.max(cursor, range.to);
  }
  return folds;
}

export function dayAxis(lanes: readonly AgendaLane[], scale: number): DayAxis {
  const window = gridWindow(lanes);
  const folds = foldsOf(lanes, window);
  const top = (minutes: number): number => {
    const at = Math.min(Math.max(minutes, window.from), window.to);
    let pixels = (at - window.from) * scale;
    for (const fold of folds) {
      if (at <= fold.from) break;
      pixels += FOLD_HEIGHT - (Math.min(at, fold.to) - fold.from) * scale;
      if (at < fold.to) return top(fold.from);
    }
    return pixels;
  };
  const marks: HourMark[] = [];
  for (let minutes = window.from; minutes < window.to; minutes += MARK_EVERY_MINUTES) {
    if (folds.some((fold) => minutes > fold.from && minutes < fold.to)) continue;
    marks.push({ minutes, label: clockOfMinutes(minutes), onTheHour: minutes % MINUTES_PER_HOUR === 0, top: top(minutes) });
  }
  const minutesAt = (pixels: number): number => {
    let minutes = window.from;
    let remaining = Math.max(0, pixels);
    for (const fold of folds) {
      const open = (fold.from - minutes) * scale;
      if (remaining <= open) return minutes + remaining / scale;
      if (remaining <= open + FOLD_HEIGHT) return fold.from;
      remaining -= open + FOLD_HEIGHT;
      minutes = fold.to;
    }
    return Math.min(minutes + remaining / scale, window.to);
  };
  return { window, height: top(window.to), marks, folds, top, minutesAt };
}

/** Escala vertical: la cita más corta del día debe poder leerse en una línea. */
export function pixelsPerMinute(lanes: readonly AgendaLane[]): number {
  const durations = lanes.flatMap((lane) => gridAppointments(lane).map(durationMinutes)).filter((d) => d > 0);
  if (durations.length === 0) return MIN_PIXELS_PER_MINUTE;
  return Math.min(MAX_PIXELS_PER_MINUTE, Math.max(MIN_PIXELS_PER_MINUTE, MIN_APPOINTMENT_HEIGHT / Math.min(...durations)));
}

function placeOf(range: MinuteRange, axis: DayAxis): Place | null {
  const from = Math.max(range.from, axis.window.from);
  const to = Math.min(range.to, axis.window.to);
  if (to <= from) return null;
  const top = axis.top(from);
  return { top, height: axis.top(to) - top };
}

export function appointmentPlace(appointment: AgendaAppointment, lane: AgendaLane, axis: DayAxis): Place | null {
  return placeOf(appointmentRange(appointment, lane), axis);
}

/** Un bloqueo puede empezar antes o terminar después del día: se pinta solo lo que cae en él. */
export function blockPlace(block: AgendaBlock, lane: AgendaLane, axis: DayAxis): Place | null {
  return placeOf(blockRange(block, lane), axis);
}

export function bandPlace(band: MinuteRange, axis: DayAxis): Place | null {
  return placeOf(band, axis);
}

/** «09:00–22:15»: de la primera a la última cita pintada del carril; `null` si no hay. */
export function laneRange(lane: AgendaLane): string | null {
  const ranges = gridAppointments(lane).map((a) => appointmentRange(a, lane));
  if (ranges.length === 0) return null;
  return `${clockOfMinutes(Math.min(...ranges.map((r) => r.from)))}–${clockOfMinutes(Math.max(...ranges.map((r) => r.to)))}`;
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
