import { EvidenceAnalysis } from '../../core/models/facility.models';
import { confidenceLevel, formFromAnalysis } from './analyze-document.helpers';

const analysis = {
  documentType: 'Reporte de dosimetría',
  obligation: { id: 'ob1', catalogKey: 'rx.dosimetria-personal', title: 'Dosimetría', subjectLabel: 'Ana' },
  fields: { performedOn: '2026-09-30', validUntil: null, notes: 'Folio D-1' },
  confidence: { overall: 90, obligation: 95, performedOn: 90, validUntil: 0 },
  warnings: [],
  ocr: { source: 'vision', chars: 120 },
  model: 'gemini',
  promptVersion: '1.0.0',
} as EvidenceAnalysis;

describe('helpers del análisis de documentos', () => {
  it('confidenceLevel nombra el nivel con texto, no solo con color', () => {
    expect(confidenceLevel(85)).toEqual({ label: 'Confianza alta', tone: 'high' });
    expect(confidenceLevel(84)).toEqual({ label: 'Confianza media', tone: 'medium' });
    expect(confidenceLevel(60)).toEqual({ label: 'Confianza media', tone: 'medium' });
    expect(confidenceLevel(59)).toEqual({ label: 'Confianza baja: revisa', tone: 'low' });
  });

  it('formFromAnalysis prellena lo sugerido y deja vacío lo que la IA no supo', () => {
    expect(formFromAnalysis(analysis)).toEqual({
      obligationId: 'ob1',
      performedOn: '2026-09-30',
      validUntil: '',
      notes: 'Folio D-1',
    });
  });

  it('sin obligación reconocida la deja para que la elija la persona', () => {
    expect(formFromAnalysis({ ...analysis, obligation: null }).obligationId).toBe('');
  });
});
