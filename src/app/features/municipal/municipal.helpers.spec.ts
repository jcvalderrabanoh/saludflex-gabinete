import { Appointment, EvaluatedObligation, ObligationDefinition } from '../../core/models/facility.models';
import { isMunicipalObligation, municipalAppointments, municipalRows } from './municipal.helpers';

const definition = (key: string, patch: Partial<ObligationDefinition> = {}): ObligationDefinition =>
  ({ key, title: key, ...patch }) as ObligationDefinition;
const obligation = (id: string, catalogKey: string): EvaluatedObligation => ({ id, catalogKey }) as EvaluatedObligation;
const PUEBLA = definition('puebla.puebla.refrendo-licencia-funcionamiento', {
  jurisdictions: [{ state: 'puebla', municipalities: ['Puebla'] }],
});

describe('isMunicipalObligation', () => {
  it('reconoce las genéricas y las que rigen en un municipio', () => {
    expect(isMunicipalObligation(definition('municipal.proteccion-civil'))).toBeTrue();
    expect(isMunicipalObligation(PUEBLA)).toBeTrue();
  });

  it('no confunde las estatales ni las federales', () => {
    expect(isMunicipalObligation(definition('proteccion-civil.simulacro'))).toBeFalse();
    expect(isMunicipalObligation(definition('estatal.x', { jurisdictions: [{ state: 'puebla' }] }))).toBeFalse();
  });
});

describe('municipalRows', () => {
  const catalog = [
    definition('cofepris.licencia-rx'),
    definition('municipal.licencia-funcionamiento'),
    definition('municipal.proteccion-civil'),
    PUEBLA,
  ];

  it('lista los trámites municipales con su obligación si está activa, activos primero', () => {
    const rows = municipalRows(catalog, [obligation('o1', 'municipal.proteccion-civil'), obligation('o2', 'cofepris.licencia-rx')]);
    expect(rows.map((r) => [r.definition.key, r.obligation?.id ?? null])).toEqual([
      ['municipal.proteccion-civil', 'o1'],
      ['municipal.licencia-funcionamiento', null],
    ]);
  });

  it('la de otro municipio solo aparece si ya está activa (no se ofrece para activar)', () => {
    const rows = municipalRows(catalog, [obligation('o3', PUEBLA.key)]);
    expect(rows[0].definition.key).toBe(PUEBLA.key);
  });
});

describe('municipalAppointments', () => {
  it('solo las citas ligadas a un trámite municipal activo', () => {
    const appointments = [
      { id: 'a1', obligationId: 'o1' },
      { id: 'a2', obligationId: 'o2' },
      { id: 'a3', obligationId: null },
    ] as Appointment[];
    const rows = municipalRows([definition('municipal.licencia-funcionamiento')], [obligation('o1', 'municipal.licencia-funcionamiento')]);
    expect(municipalAppointments(appointments, rows).map((a) => a.id)).toEqual(['a1']);
  });
});
