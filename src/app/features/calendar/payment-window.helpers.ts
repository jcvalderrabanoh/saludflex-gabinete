import { EvaluatedPaymentWindow } from '../../core/models/facility.models';

export type WindowState = 'upcoming' | 'open' | 'overdue' | 'paid';

const MS_PER_DAY = 86_400_000;

/** Días de `from` a `to` (fechas locales AAAA-MM-DD); negativo si `to` ya pasó. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** En qué punto está el plazo hoy, con el texto que lo acompaña (el color nunca va solo). */
export function windowState(window: EvaluatedPaymentWindow, today: string): { state: WindowState; label: string } {
  if (window.paid) return { state: 'paid', label: 'Pagado' };
  if (today < window.startsOn) {
    const days = daysBetween(today, window.startsOn);
    return { state: 'upcoming', label: days === 1 ? 'Abre mañana' : `Abre en ${days} días` };
  }
  const left = daysBetween(today, window.endsOn);
  if (left < 0) return { state: 'overdue', label: 'Vencido' };
  return { state: 'open', label: left === 0 ? 'Abierto · vence hoy' : left === 1 ? 'Abierto · vence mañana' : `Abierto · vence en ${left} días` };
}
