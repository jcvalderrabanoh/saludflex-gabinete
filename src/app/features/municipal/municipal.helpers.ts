import { Appointment, EvaluatedObligation, ObligationDefinition } from '../../core/models/facility.models';

export interface MunicipalRow {
  definition: ObligationDefinition;
  /** La obligación activa del establecimiento; `null` si el trámite no está activado. */
  obligation: EvaluatedObligation | null;
}

/**
 * Igual que `isMunicipalObligation` del catálogo de jc-core: las genéricas
 * (`municipal.*`) y las que rigen solo en ciertos municipios.
 */
export function isMunicipalObligation(definition: Pick<ObligationDefinition, 'key' | 'jurisdictions'>): boolean {
  return definition.key.startsWith('municipal.') || (definition.jurisdictions ?? []).some((j) => !!j.municipalities?.length);
}

/**
 * Los trámites municipales, activos primero. Las genéricas se ofrecen siempre
 * para activarse a mano; las de un municipio solo aparecen si ya están activas
 * (se activan solas donde rigen, según el domicilio).
 */
export function municipalRows(catalog: ObligationDefinition[], obligations: EvaluatedObligation[]): MunicipalRow[] {
  const rows = catalog
    .filter(isMunicipalObligation)
    .map((definition) => ({ definition, obligation: obligations.find((o) => o.catalogKey === definition.key) ?? null }))
    .filter((row) => row.obligation || !row.definition.jurisdictions?.length);
  return [...rows.filter((r) => r.obligation), ...rows.filter((r) => !r.obligation)];
}

/** Las citas que atienden alguno de los trámites municipales activos. */
export function municipalAppointments(appointments: Appointment[], rows: MunicipalRow[]): Appointment[] {
  const municipalIds = new Set(rows.flatMap((r) => (r.obligation ? [r.obligation.id] : [])));
  return appointments.filter((a) => a.obligationId && municipalIds.has(a.obligationId));
}
