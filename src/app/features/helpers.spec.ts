import { EstablishmentStatus, EvaluatedObligation, ObligationDefinition } from '../core/models/facility.models';
import { applicableDefinitions } from './obligations/activate-obligation.dialog';
import { groupSections } from './obligations/obligations.component';
import { obligationMeta } from '../core/models/labels';
import { activatedMessage, subjectSavedMessage } from './subjects/subjects.component';
import { todaySummary } from './today/today.component';
import { capturedByLabel } from './evidence/evidence-history.dialog';
import { EvidenceRecord } from '../core/models/facility.models';

const ob = (id: string, folderOrder: number) => ({ id, folderOrder }) as EvaluatedObligation;
const def = (key: string, appliesTo: string[], subject: string, folderOrder: number) =>
  ({ key, appliesTo, subject, folderOrder }) as unknown as ObligationDefinition;

describe('helpers de pantallas', () => {
  it('groupSections ordena por sección de la carpeta', () => {
    const groups = groupSections([ob('a', 7), ob('b', 2), ob('c', 7)]);
    expect(groups.map((g) => [g.order, g.title, g.items.map((i) => i.id)])).toEqual([
      [2, 'Aviso o licencia sanitaria y responsables', ['b']],
      [7, 'RPBI', ['a', 'c']],
    ]);
  });

  it('applicableDefinitions filtra por servicios y pone primero las de persona o equipo', () => {
    const result = applicableDefinitions(
      [def('aviso', [], 'establishment', 2), def('mastografo', ['mammography'], 'equipment', 6), def('dosimetria', ['xray'], 'person', 5)],
      ['xray', 'ultrasound'],
    );
    expect(result.map((d) => d.key)).toEqual(['dosimetria', 'aviso']);
  });

  it('todaySummary resume en una línea', () => {
    const s = { todayItems: [{}, {}, {}], score: { overdue: 1, missing: 2, dueSoon: 0 } } as unknown as EstablishmentStatus;
    expect(todaySummary(s)).toBe('3 cosas necesitan atención: 1 vencida, 2 sin registro.');
  });

  it('todaySummary cuenta los documentos sin vigencia', () => {
    const s = { todayItems: [{}, {}], score: { overdue: 0, missing: 0, dueSoon: 1, expiryUnknown: 1 } } as unknown as EstablishmentStatus;
    expect(todaySummary(s)).toBe('2 cosas necesitan atención: 1 por vencer, 1 sin vigencia.');
  });

  it('obligationMeta pide la vigencia de un documento sin fecha', () => {
    const o = {
      status: 'expiry-unknown',
      daysLeft: null,
      dueOn: null,
      currentRecord: { id: 'r', performedOn: '2025-01-10', validUntil: null, hasFile: true },
    } as unknown as EvaluatedObligation;
    expect(obligationMeta(o)).toBe('Sin fecha de vencimiento: captúrala o define la vigencia');
    expect(obligationMeta({ ...o, currentRecord: null })).toBe('Sin registro');
    expect(obligationMeta({ ...o, status: 'ok' })).toBe('Sin vencimiento');
  });

  it('activatedMessage dice cuántas obligaciones nacieron', () => {
    expect(activatedMessage(1)).toBe('Se activó 1 obligación. Revísala en «Hoy».');
    expect(activatedMessage(3)).toBe('Se activaron 3 obligaciones. Revísalas en «Hoy».');
  });

  it('subjectSavedMessage avisa primero del servicio que falta en el establecimiento', () => {
    expect(subjectSavedMessage({ activated: 2, missingService: 'ct' })).toBe(
      'Este equipo es de Tomografía y el establecimiento no tiene ese servicio. Agrégalo en «Establecimientos» para activar las obligaciones que le tocan.',
    );
  });

  it('subjectSavedMessage sin servicio faltante dice cuántas obligaciones nacieron, o nada', () => {
    expect(subjectSavedMessage({ activated: 1, missingService: null })).toBe(activatedMessage(1));
    expect(subjectSavedMessage({ activated: 0 })).toBeNull();
  });

  it('capturedByLabel dice quién capturó y cuándo', () => {
    const r = { createdAt: '2026-11-02T16:05:00.000Z', createdBy: { id: 'u1', name: 'Ana López' } } as unknown as EvidenceRecord;
    expect(capturedByLabel(r)).toBe('Capturado por Ana López el 2026-11-02 16:05');
  });

  it('capturedByLabel sin autor resuelto muestra solo la fecha', () => {
    const r = { createdAt: '2026-11-02T16:05:00.000Z' } as unknown as EvidenceRecord;
    expect(capturedByLabel(r)).toBe('Capturado el 2026-11-02 16:05');
  });
});
