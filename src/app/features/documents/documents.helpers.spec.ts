import { EvaluatedObligation, FacilityDocument, ObligationDefinition } from '../../core/models/facility.models';
import { documentCounters, obligationGroups, runLimited, stateLabel } from './documents.helpers';

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
    ]);
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
