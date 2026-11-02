import { DocumentState, EvaluatedObligation, FacilityDocument, ObligationDefinition } from '../../core/models/facility.models';

export type StateTone = 'neutral' | 'progress' | 'good' | 'warn' | 'bad';

const STATES: Record<DocumentState, { label: string; tone: StateTone; icon: string }> = {
  queued: { label: 'En cola', tone: 'neutral', icon: 'schedule' },
  reading: { label: 'Leyendo…', tone: 'progress', icon: 'document_scanner' },
  classified: { label: 'Por revisar', tone: 'progress', icon: 'rate_review' },
  unknown: { label: 'Tipo desconocido', tone: 'warn', icon: 'help' },
  illegible: { label: 'No se pudo leer: sube otra foto', tone: 'bad', icon: 'blur_on' },
  blocked: { label: 'Trae datos de pacientes: se borró', tone: 'bad', icon: 'block' },
  failed: { label: 'Falló: reintenta', tone: 'bad', icon: 'error' },
  linking: { label: 'Ligando…', tone: 'progress', icon: 'link' },
  linked: { label: 'Ligado', tone: 'good', icon: 'task_alt' },
  discarded: { label: 'Descartado', tone: 'neutral', icon: 'delete' },
  expired: { label: 'Caducó', tone: 'neutral', icon: 'event_busy' },
};

/** El estado siempre con texto e icono: el color solo lo refuerza. */
export function stateLabel(state: DocumentState): { label: string; tone: StateTone; icon: string } {
  return STATES[state];
}

/** Lo que la persona puede revisar y ligar. */
export const REVIEWABLE: readonly DocumentState[] = ['classified', 'unknown'];
/** Mientras haya alguno así, la bandeja se refresca sola. */
export const IN_PROGRESS: readonly DocumentState[] = ['queued', 'reading', 'linking'];

export function documentCounters(documents: readonly FacilityDocument[]) {
  const count = (states: DocumentState[]) => documents.filter((d) => states.includes(d.state)).length;
  return {
    reading: count(['queued', 'reading']),
    review: count(['classified']),
    unknown: count(['unknown']),
    problems: count(['illegible', 'failed']),
    linked: count(['linked']),
  };
}

export interface ObligationOption {
  /** Id de la obligación, o `catalog:<clave>` si hay que activarla antes. */
  value: string;
  label: string;
}

export interface ObligationGroup {
  label: string;
  options: ObligationOption[];
}

/** Prefijo de las opciones del catálogo que aún no están activas. */
export const CATALOG_PREFIX = 'catalog:';

/**
 * Primero lo que falta o venció (lo más probable y lo más urgente), luego lo
 * activo y al final lo del catálogo que no está activo. Del catálogo solo las
 * de establecimiento: las de persona o equipo se activan al registrarlos.
 */
export function obligationGroups(
  obligations: readonly EvaluatedObligation[],
  catalog: readonly ObligationDefinition[],
): ObligationGroup[] {
  const option = (o: EvaluatedObligation): ObligationOption => ({
    value: o.id,
    label: o.subjectLabel ? `${o.title} · ${o.subjectLabel}` : o.title,
  });
  const urgent = obligations.filter((o) => o.status === 'missing' || o.status === 'overdue');
  const rest = obligations.filter((o) => !urgent.includes(o));
  const active = new Set(obligations.map((o) => o.catalogKey));
  const inactive = catalog
    .filter((d) => d.subject === 'establishment' && !active.has(d.key))
    .map((d) => ({ value: `${CATALOG_PREFIX}${d.key}`, label: d.title }));
  return [
    { label: 'Vencidas o sin registro', options: urgent.map(option) },
    { label: 'Activas', options: rest.map(option) },
    { label: 'Del catálogo (no activas)', options: inactive },
  ].filter((g) => g.options.length > 0);
}

/** Corre `work` sobre cada elemento con a lo más `limit` en paralelo. */
export async function runLimited<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}
