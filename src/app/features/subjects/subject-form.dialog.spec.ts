import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { Equipment, EquipmentCatalog, Establishment } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { SubjectFormData, SubjectFormDialogComponent } from './subject-form.dialog';

const MATRIZ = { id: 'est', name: 'Matriz' } as Establishment;
const NORTE = { id: 'est-2', name: 'Norte' } as Establishment;
const EQUIPMENT = { id: 'eq1', establishmentId: 'est', name: 'Ultrasonido', modality: 'ultrasound' } as Equipment;
const CATALOG: EquipmentCatalog = {
  version: '2026-11-14',
  types: [
    { key: 'ultrasonido', name: 'Ultrasonido', category: 'imaging', modality: 'ultrasound', ionizing: false, maintenance: [] },
    { key: 'autoclave', name: 'Autoclave o esterilizador', category: 'support', modality: 'other', ionizing: false, maintenance: [] },
  ],
};

function setup(data: SubjectFormData, establishments: Establishment[] = [MATRIZ], catalog = of(CATALOG)) {
  const api = {
    equipmentCatalog: jasmine.createSpy('equipmentCatalog').and.returnValue(catalog),
    registerEquipment: jasmine.createSpy('registerEquipment').and.returnValue(of({ subject: EQUIPMENT, activated: [] })),
    updateEquipment: jasmine.createSpy('updateEquipment').and.returnValue(of({ subject: EQUIPMENT, activated: [] })),
    linkableUsers: jasmine.createSpy('linkableUsers').and.returnValue(of([])),
  };
  TestBed.configureTestingModule({
    imports: [SubjectFormDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: FacilityApiService, useValue: api },
      { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  });
  TestBed.inject(EstablishmentContextService).setEstablishments(establishments);
  const fixture = TestBed.createComponent(SubjectFormDialogComponent);
  fixture.detectChanges();
  return { component: fixture.componentInstance, api, fixture, element: fixture.nativeElement as HTMLElement };
}

describe('SubjectFormDialogComponent · equipo', () => {
  it('con un solo establecimiento lo muestra y registra ahí el equipo', () => {
    const { component, api, element } = setup({ kind: 'equipment', establishmentId: 'est' });
    expect(element.textContent).toContain('Establecimiento');
    expect(element.textContent).toContain('Matriz');
    component.equipment.patchValue({ name: 'Ultrasonido', modality: 'ultrasound' });

    component.save();

    expect(api.registerEquipment).toHaveBeenCalledWith('est', jasmine.objectContaining({ name: 'Ultrasonido', modality: 'ultrasound' }));
  });

  it('con varios establecimientos lo registra en el que se elija', () => {
    const { component, api } = setup({ kind: 'equipment', establishmentId: 'est' }, [MATRIZ, NORTE]);
    component.equipment.patchValue({ name: 'Ultrasonido', modality: 'ultrasound', establishmentId: 'est-2' });

    component.save();

    expect(api.registerEquipment).toHaveBeenCalledWith('est-2', jasmine.objectContaining({ name: 'Ultrasonido' }));
  });

  it('al editar muestra su establecimiento y no lo manda en el cambio', () => {
    const { component, api, element } = setup({ kind: 'equipment', establishmentId: 'est-2', current: EQUIPMENT }, [MATRIZ, NORTE]);
    expect(element.textContent).toContain('Matriz');

    component.save();

    const sent = api.updateEquipment.calls.mostRecent().args[1];
    expect(sent.establishmentId).toBeUndefined();
  });
});

describe('SubjectFormDialogComponent · tipo y ficha del equipo', () => {
  it('ofrece los tipos del catálogo', () => {
    const { component, api } = setup({ kind: 'equipment', establishmentId: 'est' });

    expect(api.equipmentCatalog).toHaveBeenCalled();
    expect(component.typeGroups().map((g) => g.label)).toEqual(['Equipo de imagen', 'Equipo de apoyo']);
  });

  it('con tipo, la modalidad sale del tipo y no se manda', () => {
    const { component, api } = setup({ kind: 'equipment', establishmentId: 'est' });
    component.equipment.patchValue({ name: 'Esterilizador', modality: 'xray' });
    component.equipment.controls.equipmentTypeKey.setValue('autoclave');

    expect(component.equipment.controls.modality.disabled).toBeTrue();
    expect(component.equipment.controls.modality.value).toBe('other');
    component.save();

    const sent = api.registerEquipment.calls.mostRecent().args[1];
    expect(sent.equipmentTypeKey).toBe('autoclave');
    expect(sent.modality).toBeUndefined();
  });

  it('sin tipo se manda la modalidad elegida', () => {
    const { component, api } = setup({ kind: 'equipment', establishmentId: 'est' });
    component.equipment.patchValue({ name: 'Ultrasonido', modality: 'ultrasound' });

    component.save();

    const sent = api.registerEquipment.calls.mostRecent().args[1];
    expect(sent.modality).toBe('ultrasound');
    expect(sent.equipmentTypeKey).toBeNull();
  });

  it('manda la ficha: estado, registro sanitario, proveedor y fechas', () => {
    const { component, api } = setup({ kind: 'equipment', establishmentId: 'est' });
    component.equipment.patchValue({
      name: 'Ultrasonido',
      operationalStatus: 'restricted',
      sanitaryRegistration: '1234E2026 SSA',
      serviceProvider: 'Servicios Médicos del Norte',
      installedOn: '2026-01-15',
      warrantyUntil: '2028-01-15',
    });

    component.save();

    expect(api.registerEquipment).toHaveBeenCalledWith(
      'est',
      jasmine.objectContaining({
        operationalStatus: 'restricted',
        sanitaryRegistration: '1234E2026 SSA',
        serviceProvider: 'Servicios Médicos del Norte',
        installedOn: '2026-01-15',
        warrantyUntil: '2028-01-15',
      }),
    );
  });

  it('un equipo nuevo empieza «Operando»', () => {
    const { component } = setup({ kind: 'equipment', establishmentId: 'est' });

    expect(component.equipment.controls.operationalStatus.value).toBe('operating');
  });

  it('no deja guardar una garantía que termina antes de la instalación', () => {
    const { component, api, fixture, element } = setup({ kind: 'equipment', establishmentId: 'est' });
    component.equipment.patchValue({ name: 'Ultrasonido', installedOn: '2026-05-01', warrantyUntil: '2026-04-01' });
    fixture.detectChanges();

    expect(component.invalid()).toBeTrue();
    expect(element.textContent).toContain('La garantía no puede terminar antes de la instalación');
    component.save();
    expect(api.registerEquipment).not.toHaveBeenCalled();
  });

  it('al editar carga la ficha y el tipo, con la modalidad bloqueada', () => {
    const current = {
      ...EQUIPMENT,
      equipmentTypeKey: 'ultrasonido',
      operationalStatus: 'down',
      installedOn: '2025-03-01',
    } as Equipment;
    const { component } = setup({ kind: 'equipment', establishmentId: 'est', current });

    expect(component.equipment.controls.equipmentTypeKey.value).toBe('ultrasonido');
    expect(component.equipment.controls.operationalStatus.value).toBe('down');
    expect(component.equipment.controls.installedOn.value).toBe('2025-03-01');
    expect(component.equipment.controls.modality.disabled).toBeTrue();
  });

  it('si el catálogo no carga, se registra solo con la modalidad', () => {
    const { component, api, element } = setup({ kind: 'equipment', establishmentId: 'est' }, [MATRIZ], throwError(() => new Error('500')));
    component.equipment.patchValue({ name: 'Ultrasonido', modality: 'ultrasound' });

    expect(element.textContent).toContain('No pudimos cargar los tipos de equipo');
    component.save();
    expect(api.registerEquipment).toHaveBeenCalledWith('est', jasmine.objectContaining({ modality: 'ultrasound' }));
  });
});
