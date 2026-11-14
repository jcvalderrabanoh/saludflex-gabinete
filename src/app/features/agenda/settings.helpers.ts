import { AgendaResource, AgendaWeekHour } from '../../core/models/agenda.models';
import { EquipmentModality } from '../../core/models/facility.models';
import { MODALITY_LABELS } from '../../core/models/labels';
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

/** Tope de jc-core (`RESOURCE_HOURS_MAX_INTERVALS`). */
const MAX_WEEK_INTERVALS = 28;

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
  const total = rows.reduce((count, row) => count + row.intervals.length, 0);
  if (total > MAX_WEEK_INTERVALS) return `El horario admite hasta ${MAX_WEEK_INTERVALS} tramos en la semana y tiene ${total}. Quita algunos.`;
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

/** Dónde se resuelve un servicio sin equipo: dar de alta uno. */
export const EQUIPMENT_ROUTE = '/operacion/equipos-y-personal';

export interface ServicePlace {
  /** Si hay al menos un equipo del establecimiento donde cabe. */
  ready: boolean;
  text: string;
}

const modalityLabel = (modality: string): string => MODALITY_LABELS[modality as EquipmentModality] ?? modality;

/** «No hay equipos de Ultrasonido en este establecimiento.» */
export function noPlaceText(modality: string): string {
  return `No hay equipos de ${modalityLabel(modality)} en este establecimiento.`;
}

/** «A», «A y B», «A, B y C». */
function joinNames(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/**
 * En qué equipos del establecimiento se agenda un servicio de esa modalidad.
 * `null` cuando no se sabe (equipos sin cargar, sin establecimiento o sin modalidad): sin dato no es cero.
 */
export function placeOf(modality: string, resources: readonly Pick<AgendaResource, 'establishmentId' | 'name' | 'modality'>[] | null, establishmentId: string | null): ServicePlace | null {
  if (!resources || !establishmentId || !modality) return null;
  const names = resources.filter((r) => r.establishmentId === establishmentId && r.modality === modality).map((r) => r.name);
  return names.length ? { ready: true, text: `Se agenda en ${joinNames(names)}.` } : { ready: false, text: noPlaceText(modality) };
}
