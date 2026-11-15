import { EquipmentMaintenance, EquipmentType } from '../../core/models/facility.models';
import {
  catalogGroups,
  maintenanceBasis,
  maintenancePeriod,
  maintenanceRows,
  typeOfEquipment,
  warrantyBeforeInstall,
} from './equipment-catalog.helpers';

function maintenance(overrides: Partial<EquipmentMaintenance> = {}): EquipmentMaintenance {
  return {
    kind: 'preventive',
    title: 'Mantenimiento preventivo',
    obligationKey: 'equipo.mantenimiento-preventivo',
    period: { unit: 'month', every: 6 },
    afterRepair: false,
    basis: 'manufacturer',
    norms: ['NOM-016-SSA3-2012 5.1.13.1'],
    verification: 'NV',
    performer: 'provider',
    note: 'Usa el del manual.',
    ...overrides,
  };
}

function type(key: string, category: EquipmentType['category'], m: EquipmentMaintenance[] = []): EquipmentType {
  return { key, name: key, category, modality: 'other', ionizing: false, maintenance: m };
}

describe('catalogGroups', () => {
  it('separa los tipos en imagen y apoyo conservando el orden del catálogo', () => {
    const groups = catalogGroups([type('rx', 'imaging'), type('autoclave', 'support'), type('us', 'imaging')]);

    expect(groups.map((g) => g.label)).toEqual(['Equipo de imagen', 'Equipo de apoyo']);
    expect(groups[0].types.map((t) => t.key)).toEqual(['rx', 'us']);
    expect(groups[1].types.map((t) => t.key)).toEqual(['autoclave']);
  });

  it('omite el grupo que no tiene tipos', () => {
    expect(catalogGroups([type('autoclave', 'support')]).map((g) => g.label)).toEqual(['Equipo de apoyo']);
  });

  it('sin catálogo no hay grupos', () => {
    expect(catalogGroups([])).toEqual([]);
  });
});

describe('maintenanceBasis', () => {
  it('cita el numeral solo si lo fija la norma y está verificado', () => {
    const basis = maintenanceBasis(maintenance({ basis: 'norm', verification: 'V', norms: ['NOM-229-SSA1-2002 10.4.1'] }));
    expect(basis).toEqual({ label: 'Norma · NOM-229-SSA1-2002 10.4.1', norm: true });
  });

  it('une varios numerales de la norma', () => {
    const basis = maintenanceBasis(maintenance({ basis: 'norm', verification: 'V', norms: ['NOM-229 12.1.4', 'NOM-229 12.1.5'] }));
    expect(basis.label).toBe('Norma · NOM-229 12.1.4, NOM-229 12.1.5');
  });

  it('lo del fabricante dice «Fabricante» aunque cite normas', () => {
    expect(maintenanceBasis(maintenance({ basis: 'manufacturer' }))).toEqual({ label: 'Fabricante', norm: false });
  });

  it('lo de planeación dice «Planeación»', () => {
    expect(maintenanceBasis(maintenance({ basis: 'planning', norms: ['IEC 62353'] }))).toEqual({ label: 'Planeación', norm: false });
  });

  it('una base de norma sin verificar no se presenta como norma', () => {
    expect(maintenanceBasis(maintenance({ basis: 'norm', verification: 'NV' }))).toEqual({ label: 'Planeación', norm: false });
  });
});

describe('maintenancePeriod', () => {
  it('meses: uno, varios y años', () => {
    expect(maintenancePeriod({ unit: 'month', every: 1 })).toBe('Cada mes');
    expect(maintenancePeriod({ unit: 'month', every: 6 })).toBe('Cada 6 meses');
    expect(maintenancePeriod({ unit: 'month', every: 12 })).toBe('Cada año');
    expect(maintenancePeriod({ unit: 'month', every: 24 })).toBe('Cada 2 años');
    expect(maintenancePeriod({ unit: 'month', every: 3 })).toBe('Cada 3 meses');
  });

  it('días: diario, semanas y días sueltos', () => {
    expect(maintenancePeriod({ unit: 'day', every: 1 })).toBe('Cada día');
    expect(maintenancePeriod({ unit: 'day', every: 7 })).toBe('Cada semana');
    expect(maintenancePeriod({ unit: 'day', every: 14 })).toBe('Cada 2 semanas');
    expect(maintenancePeriod({ unit: 'day', every: 10 })).toBe('Cada 10 días');
  });

  it('sin periodo es por evento', () => {
    expect(maintenancePeriod(null)).toBe('Sin periodo fijo');
  });
});

describe('maintenanceRows', () => {
  it('lo que no tiene obligación es «Recomendado» y no se vigila', () => {
    const [row] = maintenanceRows(type('us', 'imaging', [maintenance({ obligationKey: null, basis: 'planning', kind: 'electrical-safety' })]));

    expect(row.tracked).toBeFalse();
    expect(row.tag).toBe('Recomendado');
  });

  it('lo que tiene obligación avisa de su vencimiento', () => {
    const [row] = maintenanceRows(type('us', 'imaging', [maintenance()]));

    expect(row.tracked).toBeTrue();
    expect(row.tag).toBe('Con aviso de vencimiento');
  });

  it('marca «sugerido» la periodicidad que no fija la norma', () => {
    const [manufacturer, norm] = maintenanceRows(
      type('rx', 'imaging', [maintenance(), maintenance({ basis: 'norm', verification: 'V', period: { unit: 'month', every: 12 } })]),
    );

    expect(manufacturer.period).toBe('Cada 6 meses (sugerido)');
    expect(norm.period).toBe('Cada año');
  });

  it('dice «también tras reparar» y quién lo hace', () => {
    const [row] = maintenanceRows(type('rx', 'imaging', [maintenance({ afterRepair: true, performer: 'specialist' })]));

    expect(row.afterRepair).toBe('También tras reparar');
    expect(row.performer).toBe('Asesor especializado o físico médico');
  });

  it('las pruebas de aceptación van «al instalar»', () => {
    const [row] = maintenanceRows(type('rx', 'imaging', [maintenance({ kind: 'acceptance', period: null, basis: 'norm', verification: 'V' })]));

    expect(row.period).toBe('Al instalar');
  });

  it('ningún texto promete cumplimiento', () => {
    const rows = maintenanceRows(
      type('rx', 'imaging', [maintenance(), maintenance({ basis: 'norm', verification: 'V' }), maintenance({ obligationKey: null })]),
    );
    const text = JSON.stringify(rows).toLowerCase();

    for (const banned of ['cumples', 'mínimo por ley', 'clausura', 'obligatorio']) expect(text).not.toContain(banned);
  });
});

describe('warrantyBeforeInstall', () => {
  it('marca la garantía que termina antes de instalar', () => {
    expect(warrantyBeforeInstall('2026-05-01', '2026-04-30')).toBeTrue();
  });

  it('acepta la garantía el mismo día o después', () => {
    expect(warrantyBeforeInstall('2026-05-01', '2026-05-01')).toBeFalse();
    expect(warrantyBeforeInstall('2026-05-01', '2028-05-01')).toBeFalse();
  });

  it('sin alguna de las dos fechas no hay nada que comparar', () => {
    expect(warrantyBeforeInstall('', '2026-01-01')).toBeFalse();
    expect(warrantyBeforeInstall('2026-01-01', null)).toBeFalse();
  });
});

describe('typeOfEquipment', () => {
  const types = [type('ultrasonido', 'imaging'), type('rx-convencional', 'imaging'), type('sala-rx', 'imaging')];

  it('con tipo devuelve ese tipo', () => {
    expect(typeOfEquipment({ modality: 'xray', equipmentTypeKey: 'sala-rx' }, types)).toEqual({ type: types[2], byModality: false });
  });

  it('sin tipo devuelve el que el backend usa para su modalidad', () => {
    expect(typeOfEquipment({ modality: 'xray', equipmentTypeKey: null }, types)).toEqual({ type: types[1], byModality: true });
    expect(typeOfEquipment({ modality: 'ultrasound' }, types)).toEqual({ type: types[0], byModality: true });
  });

  it('un tipo que ya no existe cae al de su modalidad', () => {
    expect(typeOfEquipment({ modality: 'ultrasound', equipmentTypeKey: 'borrado' }, types)?.type.key).toBe('ultrasonido');
  });

  it('sin equivalente en el catálogo no hay tipo', () => {
    expect(typeOfEquipment({ modality: 'ct' }, types)).toBeNull();
  });
});
