import { IncidentResult } from '../../core/models/facility.models';
import { closeNotices, incidentState } from './incident.helpers';

const result = (overrides: Partial<IncidentResult>) => ({ qualityChecks: [], sealed: true, ...overrides }) as IncidentResult;

describe('incidentState', () => {
  it('abierto y cerrado llevan texto e icono distintos', () => {
    expect(incidentState({ state: 'open' })).toEqual({ label: 'Abierto', icon: 'build' });
    expect(incidentState({ state: 'closed' })).toEqual({ label: 'Cerrado', icon: 'check_circle' });
  });
});

describe('closeNotices', () => {
  it('sin pendientes no hay avisos', () => {
    expect(closeNotices(result({}))).toEqual([]);
  });

  it('pide el control de calidad si la reparación lo volvió a exigir', () => {
    expect(closeNotices(result({ qualityChecks: ['rx.control-calidad-equipo'] }))).toEqual(['Registra el control de calidad antes de usar el equipo (NOM-229).']);
  });

  it('avisa si el sello sigue en proceso', () => {
    expect(closeNotices(result({ sealed: false }))).toEqual(['El cierre se guardó; el sello en la bitácora se completa en minutos.']);
  });

  it('al reportar (sin `sealed`) no avisa del sello', () => {
    expect(closeNotices(result({ sealed: undefined }))).toEqual([]);
  });
});
