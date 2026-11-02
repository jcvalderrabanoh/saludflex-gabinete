import { EvidenceAnalysis } from '../../core/models/facility.models';

/** Desde aquí la sugerencia se acepta casi sin revisar. */
export const HIGH_CONFIDENCE = 85;
/** Por debajo, la persona debe revisar el dato con el documento a la vista. */
export const MEDIUM_CONFIDENCE = 60;

export type ConfidenceTone = 'high' | 'medium' | 'low';

/** El nivel siempre lleva texto: el color solo lo refuerza. */
export function confidenceLevel(percent: number): { label: string; tone: ConfidenceTone } {
  if (percent >= HIGH_CONFIDENCE) return { label: 'Confianza alta', tone: 'high' };
  if (percent >= MEDIUM_CONFIDENCE) return { label: 'Confianza media', tone: 'medium' };
  return { label: 'Confianza baja: revisa', tone: 'low' };
}

export interface AnalyzedForm {
  obligationId: string;
  performedOn: string;
  validUntil: string;
  notes: string;
}

/** Lo que la IA no supo queda vacío: la persona lo captura. */
export function formFromAnalysis(analysis: EvidenceAnalysis): AnalyzedForm {
  return {
    obligationId: analysis.obligation?.id ?? '',
    performedOn: analysis.fields.performedOn ?? '',
    validUntil: analysis.fields.validUntil ?? '',
    notes: analysis.fields.notes ?? '',
  };
}
