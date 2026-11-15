import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { Equipment, EquipmentIncident, EquipmentType, IncidentResult } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { CloseIncidentDialogComponent } from './close-incident.dialog';
import { EquipmentDetailData, EquipmentDetailDialogComponent } from './equipment-detail.dialog';
import { ReportIncidentDialogComponent } from './report-incident.dialog';

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

const OPEN = { id: 'inc2', equipmentId: 'eq1', reportedOn: '2026-11-12', description: 'Se apaga al disparar', impact: 'restricted', state: 'open', closedOn: null, resolution: null, performedBy: null } as EquipmentIncident;
const CLOSED = { id: 'inc1', equipmentId: 'eq1', reportedOn: '2026-10-01', description: 'No enciende', impact: 'down', state: 'closed', closedOn: '2026-10-03', resolution: 'Cambio de fuente', performedBy: 'Servicios del Norte' } as EquipmentIncident;

interface Options {
  incidents?: Observable<EquipmentIncident[]>;
  perms?: string[];
  dialogResult?: IncidentResult | undefined;
}

function setup(partial: Omit<EquipmentDetailData, 'today'>, options: Options = {}) {
  const api = { equipmentIncidents: jasmine.createSpy('equipmentIncidents').and.returnValue(options.incidents ?? of([OPEN, CLOSED])) };
  const dialog = { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(options.dialogResult) }) };
  const ref = { close: jasmine.createSpy('close') };
  const perms = options.perms ?? ['facility.read', 'facility.manage'];
  TestBed.configureTestingModule({
    imports: [EquipmentDetailDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: MAT_DIALOG_DATA, useValue: { ...partial, today: '2026-11-15' } },
      { provide: FacilityApiService, useValue: api },
      { provide: MatDialogRef, useValue: ref },
      { provide: PermissionsService, useValue: { can: (a: string) => perms.includes(`facility.${a}`) } },
    ],
  });
  TestBed.overrideProvider(MatDialog, { useValue: dialog });
  const fixture = TestBed.createComponent(EquipmentDetailDialogComponent);
  fixture.detectChanges();
  return { component: fixture.componentInstance, api, dialog, ref, fixture, element: fixture.nativeElement as HTMLElement };
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

  it('sin tipo muestra los del tipo que le toca por su modalidad y lo dice', () => {
    const conventional = { ...RX, key: 'rx-convencional', name: 'Rayos X convencional' };
    const { element } = setup({ equipment: { ...EQUIPMENT, equipmentTypeKey: null }, types: [conventional] });

    expect(element.querySelectorAll('[data-testid="maintenance"]').length).toBe(3);
    expect(element.textContent).toContain('Sin tipo elegido: se muestran los de «Rayos X convencional» por su modalidad');
  });

  it('sin tipo y sin equivalente en el catálogo pide elegirlo', () => {
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

  describe('correctivos', () => {
    const incidents = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-testid="incident"]')).map((r) => r.textContent ?? '');

    it('lista los correctivos con su estado en texto, efecto y reparación', () => {
      const { api, element } = setup({ equipment: EQUIPMENT, types: [RX] });
      const rows = incidents(element);

      expect(api.equipmentIncidents).toHaveBeenCalledWith('eq1');
      expect(rows.length).toBe(2);
      expect(rows[0]).toContain('Abierto');
      expect(rows[0]).toContain('Se apaga al disparar');
      expect(rows[0]).toContain('Restringido');
      expect(rows[1]).toContain('Cerrado');
      expect(rows[1]).toContain('Cambio de fuente');
      expect(rows[1]).toContain('Servicios del Norte');
      expect(element.querySelectorAll('[data-testid="incident"] mat-icon').length).toBe(2);
    });

    it('sin correctivos lo dice', () => {
      const { element } = setup({ equipment: EQUIPMENT, types: [RX] }, { incidents: of([]) });

      expect(element.textContent).toContain('Sin correctivos registrados');
    });

    it('si no cargan lo dice', () => {
      const { element } = setup({ equipment: EQUIPMENT, types: [RX] }, { incidents: throwError(() => new Error('500')) });

      expect(element.textContent).toContain('No pudimos cargar los correctivos');
    });

    it('quien administra puede reportar y cerrar los abiertos; con solo lectura, no', () => {
      const manager = setup({ equipment: EQUIPMENT, types: [RX] });
      expect(manager.element.textContent).toContain('Reportar falla');
      expect(manager.element.querySelectorAll('[data-testid="close-incident"]').length).toBe(1);

      TestBed.resetTestingModule();
      const reader = setup({ equipment: EQUIPMENT, types: [RX] }, { perms: ['facility.read'] });
      expect(reader.element.textContent).not.toContain('Reportar falla');
      expect(reader.element.querySelectorAll('[data-testid="close-incident"]').length).toBe(0);
    });

    it('al reportar actualiza el estado del equipo y vuelve a cargar la lista', () => {
      const result = { incident: OPEN, operationalStatus: 'down', qualityChecks: [], replayed: false } as unknown as IncidentResult;
      const { component, api, dialog, fixture, element } = setup({ equipment: EQUIPMENT, types: [RX] }, { dialogResult: result });

      component.report();
      fixture.detectChanges();

      expect(dialog.open).toHaveBeenCalledWith(ReportIncidentDialogComponent, jasmine.objectContaining({ data: { equipmentId: 'eq1', equipmentName: 'Sala 1', today: '2026-11-15' } }));
      expect(api.equipmentIncidents).toHaveBeenCalledTimes(2);
      expect(element.querySelector('.sheet')?.textContent).toContain('Fuera de servicio');
    });

    it('al cerrar con control de calidad pendiente y sin sello, avisa de ambos', () => {
      const result = { incident: { ...OPEN, state: 'closed' }, operationalStatus: 'operating', qualityChecks: ['rx.control-calidad-equipo'], sealed: false, replayed: false } as unknown as IncidentResult;
      const { component, dialog, fixture, element } = setup({ equipment: EQUIPMENT, types: [RX] }, { dialogResult: result });

      component.close(OPEN);
      fixture.detectChanges();

      expect(dialog.open).toHaveBeenCalledWith(CloseIncidentDialogComponent, jasmine.objectContaining({ data: { incident: OPEN, today: '2026-11-15' } }));
      expect(element.textContent).toContain('Registra el control de calidad antes de usar el equipo (NOM-229)');
      expect(element.textContent).toContain('El cierre se guardó; el sello en la bitácora se completa en minutos');
      expect(element.querySelector('.sheet')?.textContent).toContain('Operando');
    });

    it('al cerrar sin pendientes no muestra avisos', () => {
      const result = { incident: { ...OPEN, state: 'closed' }, operationalStatus: 'operating', qualityChecks: [], sealed: true, replayed: false } as unknown as IncidentResult;
      const { component, fixture, element } = setup({ equipment: EQUIPMENT, types: [RX] }, { dialogResult: result });

      component.close(OPEN);
      fixture.detectChanges();

      expect(element.textContent).not.toContain('Registra el control de calidad');
      expect(element.textContent).not.toContain('sello en la bitácora');
    });

    it('si se cancela el diálogo no recarga', () => {
      const { component, api } = setup({ equipment: EQUIPMENT, types: [RX] });

      component.report();

      expect(api.equipmentIncidents).toHaveBeenCalledTimes(1);
    });

    it('al cerrar la ficha avisa si algo cambió', () => {
      const result = { incident: OPEN, operationalStatus: 'down', qualityChecks: [], replayed: false } as unknown as IncidentResult;
      const { component, ref } = setup({ equipment: EQUIPMENT, types: [RX] }, { dialogResult: result });

      component.report();
      component.done();

      expect(ref.close).toHaveBeenCalledWith(true);
    });
  });
});
