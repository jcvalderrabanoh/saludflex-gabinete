import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { AgendaEquipmentData, AgendaEquipmentDialogComponent } from './agenda-equipment.dialog';

const EQUIPMENT = { id: 'us1', establishmentId: 'est', name: 'Ultrasonido 1', modality: 'ultrasound', room: 'Sala 2' };
const WEEKDAY_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: '08:00', closesAt: '18:00' }));

function setup(data: Partial<AgendaEquipmentData> = {}) {
  const facility = {
    registerEquipment: jasmine.createSpy('registerEquipment').and.returnValue(of({ subject: EQUIPMENT, activated: [{ id: 'o1', catalogKey: 'k' }] })),
    updateEquipment: jasmine.createSpy('updateEquipment').and.returnValue(of({ subject: EQUIPMENT, activated: [] })),
  };
  const agenda = { replaceHours: jasmine.createSpy('replaceHours').and.returnValue(of(WEEKDAY_HOURS)) };
  const ref = { close: jasmine.createSpy('close') };
  TestBed.configureTestingModule({
    imports: [AgendaEquipmentDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: FacilityApiService, useValue: facility },
      { provide: AgendaApiService, useValue: agenda },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: { establishmentId: 'est', ...data } },
    ],
  });
  const fixture = TestBed.createComponent(AgendaEquipmentDialogComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, facility, agenda, ref, element: fixture.nativeElement as HTMLElement };
}

describe('AgendaEquipmentDialogComponent', () => {
  it('trae la modalidad del servicio que lo pidió y propone lunes a viernes de 08:00 a 18:00', () => {
    const { component } = setup({ modality: 'ultrasound' });

    expect(component.form.controls.modality.value).toBe('ultrasound');
    expect(component.weekdays()).toEqual([1, 2, 3, 4, 5]);
    expect(component.form.controls.opensAt.value).toBe('08:00');
    expect(component.form.controls.closesAt.value).toBe('18:00');
  });

  it('da de alta el equipo y guarda su horario en el mismo paso', () => {
    const { component, facility, agenda, ref } = setup({ modality: 'ultrasound' });
    component.form.patchValue({ name: ' Ultrasonido 1 ', room: 'Sala 2' });

    component.save();

    expect(facility.registerEquipment).toHaveBeenCalledWith('est', { name: 'Ultrasonido 1', modality: 'ultrasound', room: 'Sala 2' });
    expect(agenda.replaceHours).toHaveBeenCalledWith('us1', jasmine.arrayWithExactContents(WEEKDAY_HOURS));
    expect(ref.close).toHaveBeenCalledWith({ equipmentId: 'us1', name: 'Ultrasonido 1', created: true, hoursSaved: true, activated: 1 });
  });

  it('si el horario falla, el equipo ya quedó: cierra y avisa que falta el horario', () => {
    const { component, agenda, ref } = setup({ modality: 'ultrasound' });
    agenda.replaceHours.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    component.form.patchValue({ name: 'Ultrasonido 1' });

    component.save();

    expect(ref.close).toHaveBeenCalledWith(jasmine.objectContaining({ equipmentId: 'us1', hoursSaved: false }));
  });

  it('si el alta falla, se queda abierto con el motivo y no toca el horario', () => {
    const { fixture, component, facility, agenda, ref, element } = setup();
    facility.registerEquipment.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Nombre repetido' } })));
    component.form.patchValue({ name: 'Rayos X', modality: 'xray' });

    component.save();
    fixture.detectChanges();

    expect(agenda.replaceHours).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Nombre repetido');
  });

  it('no deja guardar sin nombre, sin días o con un horario imposible', () => {
    const { component } = setup();
    expect(component.canSave()).toBeFalse();

    component.form.patchValue({ name: 'Rayos X' });
    expect(component.canSave()).withContext('sin modalidad').toBeFalse();

    component.form.patchValue({ name: 'Rayos X', modality: 'xray' });
    expect(component.canSave()).toBeTrue();

    component.toggleDay(1);
    component.toggleDay(2);
    component.toggleDay(3);
    component.toggleDay(4);
    component.toggleDay(5);
    expect(component.canSave()).toBeFalse();

    component.toggleDay(6);
    component.form.patchValue({ opensAt: '18:00', closesAt: '08:00' });
    expect(component.problem()).toContain('Sábado');
    expect(component.canSave()).toBeFalse();
  });

  it('al editar cambia nombre, modalidad y sala; el horario se edita en «Horarios y bloqueos»', () => {
    const { component, facility, agenda, ref, element } = setup({ editing: EQUIPMENT });
    expect(element.textContent).not.toContain('Días que trabaja');
    component.form.patchValue({ name: 'Ultrasonido A' });

    component.save();

    expect(facility.updateEquipment).toHaveBeenCalledWith('us1', { name: 'Ultrasonido A', modality: 'ultrasound', room: 'Sala 2' });
    expect(agenda.replaceHours).not.toHaveBeenCalled();
    expect(ref.close).toHaveBeenCalledWith(jasmine.objectContaining({ equipmentId: 'us1', created: false }));
  });
});
