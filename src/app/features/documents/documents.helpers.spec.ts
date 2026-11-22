import { EvaluatedObligation, FacilityDocument, ObligationDefinition } from '../../core/models/facility.models';
import {
  CUSTOM_VALUE,
  buildLinkInput,
  documentCounters,
  initialObligation,
  obligationGroups,
  runLimited,
  stateLabel,
} from './documents.helpers';

const doc = (state: FacilityDocument['state']) => ({ id: state, state }) as FacilityDocument;
const ob = (id: string, catalogKey: string, status: EvaluatedObligation['status']) =>
  ({ id, catalogKey, status, title: id, subjectLabel: null }) as EvaluatedObligation;
const def = (key: string, subject = 'establishment') =>
  ({ key, title: key, subject, appliesTo: [] }) as unknown as ObligationDefinition;

describe('helpers de la bandeja', () => {
  it('cada estado lleva texto, no solo color', () => {
    expect(stateLabel('queued')).toEqual({ label: 'En cola', tone: 'neutral', icon: 'schedule' });
    expect(stateLabel('unknown')).toEqual({ label: 'Tipo desconocido', tone: 'warn', icon: 'help' });
    expect(stateLabel('illegible')).toEqual({ label: 'No se pudo leer: sube otra foto', tone: 'bad', icon: 'blur_on' });
    expect(stateLabel('linked').label).toBe('Ligado');
  });

  it('los contadores agrupan por lo que la persona tiene que hacer', () => {
    expect(
      documentCounters([doc('queued'), doc('reading'), doc('classified'), doc('unknown'), doc('unknown'), doc('linked'), doc('failed')]),
    ).toEqual({ reading: 2, review: 1, unknown: 2, problems: 1, linked: 1 });
  });

  it('las obligaciones se ofrecen primero las que faltan o vencieron, luego las activas y al final el catálogo no activo', () => {
    const groups = obligationGroups(
      [ob('a', 'k.a', 'ok'), ob('b', 'k.b', 'missing'), ob('c', 'k.c', 'overdue')],
      [def('k.a'), def('k.b'), def('k.c'), def('k.d'), def('k.persona', 'person')],
    );
    expect(groups.map((g) => [g.label, g.options.map((o) => o.value)])).toEqual([
      ['Vencidas o sin registro', ['b', 'c']],
      ['Activas', ['a']],
      ['Del catálogo (no activas)', ['catalog:k.d']],
      ['Fuera del catálogo', [CUSTOM_VALUE]],
    ]);
  });

  it('la del catálogo que reconoció la IA se ofrece aunque sea de persona o equipo', () => {
    const groups = obligationGroups([], [def('k.d'), def('k.persona', 'person')], 'k.persona');
    expect(groups[0].options.map((o) => o.value)).toEqual(['catalog:k.d', 'catalog:k.persona']);
  });

  it('preselecciona la activa, la del catálogo o la propia según lo que propuso la IA', () => {
    const withSuggestion = (suggestion: Partial<NonNullable<FacilityDocument['suggestion']>>, suggestedObligationId: string | null = null) =>
      ({ suggestedObligationId, suggestion }) as FacilityDocument;
    expect(initialObligation(withSuggestion({}, 'ob-1'))).toBe('ob-1');
    expect(
      initialObligation(withSuggestion({ catalogMatch: { catalogKey: 'k.d', title: 'D', subject: 'establishment' } })),
    ).toBe('catalog:k.d');
    expect(initialObligation(withSuggestion({ customProposal: { title: 'Póliza', kind: 'document' } }))).toBe(CUSTOM_VALUE);
    expect(initialObligation({ suggestedObligationId: null, suggestion: null } as FacilityDocument)).toBe('');
  });

  describe('lo que se manda al ligar', () => {
    const fields = { performedOn: '2026-10-15', validUntil: '', notes: ' Folio 1 ' };

    it('una activa va por su id', () => {
      expect(buildLinkInput('ob-1', fields)).toEqual({ obligationId: 'ob-1', performedOn: '2026-10-15', notes: 'Folio 1' });
    });

    it('una del catálogo va por su clave y, si aplica, con la persona o equipo', () => {
      expect(buildLinkInput('catalog:k.persona', { ...fields, validUntil: '2027-01-01' }, { subjectLabel: ' Dra. Pérez ' })).toEqual({
        catalogKey: 'k.persona',
        subjectLabel: 'Dra. Pérez',
        performedOn: '2026-10-15',
        validUntil: '2027-01-01',
        notes: 'Folio 1',
      });
    });

    it('una propia va con título, sección y tipo; el periodo solo si es periódica', () => {
      expect(
        buildLinkInput(CUSTOM_VALUE, fields, {
          custom: { title: ' Póliza de RC ', folderOrder: 12, kind: 'document', periodUnit: 'month', periodEvery: 12 },
        }),
      ).toEqual({
        custom: { title: 'Póliza de RC', folderOrder: 12, kind: 'document' },
        performedOn: '2026-10-15',
        notes: 'Folio 1',
      });
      expect(
        buildLinkInput(CUSTOM_VALUE, fields, {
          custom: { title: 'Revisión de la planta', folderOrder: 6, kind: 'periodic', periodUnit: 'month', periodEvery: 6 },
        }).custom,
      ).toEqual({ title: 'Revisión de la planta', folderOrder: 6, kind: 'periodic', periodUnit: 'month', periodEvery: 6 });
    });
  });

  it('runLimited no pasa de N en paralelo y conserva el orden de los resultados', async () => {
    let running = 0;
    let peak = 0;
    const results = await runLimited([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });
});
