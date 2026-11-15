import { EquipmentIncident, IncidentImpact, IncidentResult } from '../../core/models/facility.models';

export const INCIDENT_IMPACT_LABELS: Record<IncidentImpact, string> = {
  restricted: 'Restringido',
  down: 'Fuera de servicio',
};

/** Estado del correctivo en texto e icono (el color nunca va solo). */
export function incidentState(incident: Pick<EquipmentIncident, 'state'>): { label: string; icon: string } {
  return incident.state === 'open' ? { label: 'Abierto', icon: 'build' } : { label: 'Cerrado', icon: 'check_circle' };
}

/** Avisos tras cerrar una reparación: control de calidad pendiente y sello aún en proceso. */
export function closeNotices(result: IncidentResult): string[] {
  const notices: string[] = [];
  if (result.qualityChecks.length > 0) notices.push('Registra el control de calidad antes de usar el equipo (NOM-229).');
  if (result.sealed === false) notices.push('El cierre se guardó; el sello en la bitácora se completa en minutos.');
  return notices;
}
