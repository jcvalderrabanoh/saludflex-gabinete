import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Equipment, EquipmentType } from '../../core/models/facility.models';
import { EquipmentDetailData, EquipmentDetailDialogComponent } from './equipment-detail.dialog';

const RX: EquipmentType = {
  key: 'sala-rx',
  name: 'Sala de rayos X',
  category: 'imaging',
  modality: 'xray',
  ionizing: true,
  maintenance: [
    {
      kind: 'quality-control',
      title: 'Control de calidad (kV, tiempo, mAs)',
      obligationKey: 'rx.control-calidad-equipo',
      period: { unit: 'month', every: 12 },
      afterRepair: true,
      basis: 'norm',
      norms: ['NOM-229-SSA1-2002 10.4.1'],
      verification: 'V',
      performer: 'specialist',
      note: 'Por lo menos una vez al año.',
    },
    {
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
    },
    {
      kind: 'electrical-safety',
      title: 'Prueba de seguridad eléctrica',
      obligationKey: null,
      period: { unit: 'month', every: 12 },
      afterRepair: true,
      basis: 'planning',
      norms: ['IEC 62353'],
      verification: 'NV',
      performer: 'provider',
      note: 'Ninguna NOM la exige.',
    },
  ],
};

const EQUIPMENT: Equipment = {
  id: 'eq1',
  establishmentId: 'est',
  name: 'Sala 1',
  modality: 'xray',
  equipmentTypeKey: 'sala-rx',
  operationalStatus: 'restricted',
  sanitaryRegistration: '1234E2026 SSA',
  serviceProvider: 'Servicios del Norte',
  installedOn: '2026-01-15',
  warrantyUntil: '2028-01-15',
};

function setup(data: EquipmentDetailData) {
  TestBed.configureTestingModule({
    imports: [EquipmentDetailDialogComponent],
    providers: [provideNoopAnimations(), { provide: MAT_DIALOG_DATA, useValue: data }],
  });
  const fixture = TestBed.createComponent(EquipmentDetailDialogComponent);
  fixture.detectChanges();
  return { component: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
}

describe('EquipmentDetailDialogComponent', () => {
  it('muestra la ficha: tipo, estado, registro, proveedor y fechas', () => {
    const { element } = setup({ equipment: EQUIPMENT, types: [RX] });
    const text = element.textContent ?? '';

    for (const value of ['Sala de rayos X', 'Con restricciones', '1234E2026 SSA', 'Servicios del Norte', '2026-01-15', '2028-01-15']) {
      expect(text).toContain(value);
    }
  });

  it('lista sus mantenimientos con periodicidad y base', () => {
    const { element } = setup({ equipment: EQUIPMENT, types: [RX] });
    const rows = Array.from(element.querySelectorAll('[data-testid="maintenance"]')).map((r) => r.textContent ?? '');

    expect(rows.length).toBe(3);
    expect(rows[0]).toContain('Norma · NOM-229-SSA1-2002 10.4.1');
    expect(rows[0]).toContain('Cada año');
    expect(rows[0]).toContain('También tras reparar');
    expect(rows[1]).toContain('Fabricante');
    expect(rows[1]).toContain('Cada 6 meses (sugerido)');
    expect(rows[2]).toContain('Planeación');
    expect(rows[2]).toContain('Recomendado');
  });

  it('no usa lenguaje de cumplimiento', () => {
    const text = (setup({ equipment: EQUIPMENT, types: [RX] }).element.textContent ?? '').toLowerCase();

    for (const banned of ['cumples', 'mínimo por ley', 'clausura']) expect(text).not.toContain(banned);
  });

  it('sin tipo pide elegirlo para ver sus mantenimientos', () => {
    const { element } = setup({ equipment: { ...EQUIPMENT, equipmentTypeKey: null }, types: [RX] });

    expect(element.querySelectorAll('[data-testid="maintenance"]').length).toBe(0);
    expect(element.textContent).toContain('Elige su tipo de equipo');
  });

  it('si el catálogo no cargó lo dice', () => {
    const { element } = setup({ equipment: EQUIPMENT, types: null });

    expect(element.textContent).toContain('No pudimos cargar los mantenimientos');
  });

  it('un equipo sin estado guardado se muestra «Operando»', () => {
    const { element } = setup({ equipment: { ...EQUIPMENT, operationalStatus: undefined }, types: [RX] });

    expect(element.textContent).toContain('Operando');
  });
});
