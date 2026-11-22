import { EstablishmentStatus, EvaluatedObligation, ObligationDefinition } from '../core/models/facility.models';
import { applicableDefinitions } from './obligations/activate-obligation.dialog';
import { groupSections } from './obligations/obligations.component';
import { dueLabel, dueVerb, obligationMeta } from '../core/models/labels';
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

  it('applicableDefinitions no ofrece las que lleva el sistema (bitácora de correctivos)', () => {
    const bitacora = { ...def('equipo.bitacora-correctivo', [], 'equipment', 6), managedBySystem: true } as ObligationDefinition;
    const result = applicableDefinitions([def('aviso', [], 'establishment', 2), bitacora], ['xray']);
    expect(result.map((d) => d.key)).toEqual(['aviso']);
  });

  it('obligationMeta avisa del control de calidad que pide una reparación', () => {
    const o = { currentRecord: { id: 'r1' }, status: 'overdue', daysLeft: -1, dueOn: '2026-11-14', requiredSince: '2026-11-14' } as unknown as EvaluatedObligation;
    expect(obligationMeta(o)).toBe('Requiere control de calidad desde 2026-11-14 (tras reparación)');
  });

  it('obligationMeta lo avisa aunque nunca se haya registrado', () => {
    const o = { currentRecord: null, status: 'overdue', requiredSince: '2026-11-14' } as unknown as EvaluatedObligation;
    expect(obligationMeta(o)).toBe('Requiere control de calidad desde 2026-11-14 (tras reparación)');
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

  it('obligationMeta marca la fecha estimada y pide la del documento', () => {
    const o = {
      status: 'due-soon',
      daysLeft: 20,
      dueOn: '2026-12-31',
      dueOnEstimated: true,
      currentRecord: { id: 'r', performedOn: '2026-03-15', validUntil: null, hasFile: true },
    } as unknown as EvaluatedObligation;
    expect(obligationMeta(o)).toBe('Faltan 20 días (2026-12-31) · fecha estimada: captura la del documento');
    expect(obligationMeta({ ...o, dueOnEstimated: false })).toBe('Faltan 20 días (2026-12-31)');
  });

  it('dueLabel marca la fecha estimada y sin marca la deja como siempre', () => {
    expect(dueLabel(-1, '2025-12-31', true)).toBe('Venció hace 1 día (2025-12-31) · fecha estimada: captura la del documento');
    expect(dueLabel(-1, '2025-12-31')).toBe('Venció hace 1 día (2025-12-31)');
  });

  it('dueVerb dice si el vencimiento es estimado', () => {
    const o = { status: 'overdue', dueOnEstimated: true } as unknown as EvaluatedObligation;
    expect(dueVerb(o)).toBe('Vencido (estimado)');
    expect(dueVerb({ ...o, status: 'due-soon' })).toBe('Vence (estimado)');
    expect(dueVerb({ ...o, dueOnEstimated: false })).toBe('Vencido');
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
