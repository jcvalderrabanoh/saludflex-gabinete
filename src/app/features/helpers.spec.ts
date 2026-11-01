import { EstablishmentStatus, EvaluatedObligation, ObligationDefinition } from '../core/models/facility.models';
import { applicableDefinitions } from './obligations/activate-obligation.dialog';
import { groupSections } from './obligations/obligations.component';
import { activatedMessage } from './subjects/subjects.component';
import { todaySummary } from './today/today.component';

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

  it('activatedMessage dice cuántas obligaciones nacieron', () => {
    expect(activatedMessage(1)).toBe('Se activó 1 obligación. Revísala en «Hoy».');
    expect(activatedMessage(3)).toBe('Se activaron 3 obligaciones. Revísalas en «Hoy».');
  });
});
