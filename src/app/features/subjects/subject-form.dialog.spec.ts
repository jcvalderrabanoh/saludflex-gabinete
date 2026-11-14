import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { Equipment, Establishment } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { SubjectFormData, SubjectFormDialogComponent } from './subject-form.dialog';

const MATRIZ = { id: 'est', name: 'Matriz' } as Establishment;
const NORTE = { id: 'est-2', name: 'Norte' } as Establishment;
const EQUIPMENT = { id: 'eq1', establishmentId: 'est', name: 'Ultrasonido', modality: 'ultrasound' } as Equipment;

function setup(data: SubjectFormData, establishments: Establishment[] = [MATRIZ]) {
  const api = {
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
  return { component: fixture.componentInstance, api, element: fixture.nativeElement as HTMLElement };
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
