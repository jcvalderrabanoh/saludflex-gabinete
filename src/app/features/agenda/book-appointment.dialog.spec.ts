import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NEVER, of, throwError } from 'rxjs';
import { AgendaAppointment, AgendaLane, AgendaServiceType } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { BookAppointmentData, BookAppointmentDialogComponent } from './book-appointment.dialog';

const MX = 'America/Mexico_City';
const lane = (id: string, name: string, modality: string): AgendaLane => ({
  id,
  establishmentId: 'est',
  name,
  modality,
  room: null,
  timeZone: MX,
  dayStartsAt: '2026-12-07T06:00:00.000Z',
  dayEndsAt: '2026-12-08T06:00:00.000Z',
  hours: [],
  blocks: [],
  appointments: [],
});
const SERVICES: AgendaServiceType[] = [
  { id: 'tc', name: 'Tomografía contrastada', modality: 'ct', durationMinutes: 15, preparation: 'Ayuno de 6 horas' },
  { id: 'rx', name: 'Rayos X simple', modality: 'xray', durationMinutes: 30, preparation: null },
];
const LANES = [lane('ct', 'Tomógrafo', 'ct'), lane('rx1', 'Rayos X sala 1', 'xray'), lane('rx2', 'Rayos X sala 2', 'xray')];
const SLOTS = [
  { startsAt: '2026-12-07T15:00:00.000Z', endsAt: '2026-12-07T15:15:00.000Z' },
  { startsAt: '2026-12-07T15:15:00.000Z', endsAt: '2026-12-07T15:30:00.000Z' },
];
const BOOKED = { id: 'a1', patientName: 'María López', warnings: [] };

function setup(data: Partial<BookAppointmentData> = {}) {
  const api = {
    slots: jasmine.createSpy('slots').and.returnValue(of({ date: '2026-12-07', timeZone: MX, durationMinutes: 15, slots: SLOTS })),
    contacts: jasmine.createSpy('contacts').and.returnValue(of([{ id: 'c1', name: 'María López', phone: '55 1234 5678' }])),
    book: jasmine.createSpy('book').and.returnValue(of(BOOKED)),
    reschedule: jasmine.createSpy('reschedule').and.returnValue(of(BOOKED)),
  };
  const ref = { close: jasmine.createSpy('close') };
  TestBed.configureTestingModule({
    imports: [BookAppointmentDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: AgendaApiService, useValue: api },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: { date: '2026-12-07', timeZone: MX, lanes: LANES, services: SERVICES, ...data } },
    ],
  });
  const fixture = TestBed.createComponent(BookAppointmentDialogComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, api, ref, element: fixture.nativeElement as HTMLElement };
}

const settle = (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  tick();
  fixture.detectChanges();
};

describe('BookAppointmentDialogComponent', () => {
  it('al elegir servicio muestra sus indicaciones, pone el único equipo posible y pide sus horas libres', fakeAsync(() => {
    const { fixture, component, api, element } = setup();

    component.form.controls.serviceTypeId.setValue('tc');
    settle(fixture);

    expect(element.querySelector('.preparation')?.textContent).toContain('Ayuno de 6 horas');
    expect(component.form.controls.equipmentId.value).toBe('ct');
    expect(api.slots).toHaveBeenCalledWith({ equipmentId: 'ct', serviceTypeId: 'tc', date: '2026-12-07' });
    expect(Array.from(element.querySelectorAll('.chip')).map((chip) => chip.textContent)).toEqual(['09:00', '09:15']);
  }));

  it('con varios equipos posibles deja elegir, y quita uno que no hace el servicio', fakeAsync(() => {
    const { fixture, component } = setup({ equipmentId: 'ct' });

    component.form.controls.serviceTypeId.setValue('rx');
    settle(fixture);

    expect(component.equipment().map((l) => l.id)).toEqual(['rx1', 'rx2']);
    expect(component.form.controls.equipmentId.value).toBe('');
    expect(component.canSave()).toBeFalse();
  }));

  it('conserva el equipo del carril donde se hizo clic cuando el servicio tiene varios posibles', fakeAsync(() => {
    const { fixture, component } = setup({ equipmentId: 'rx2', clock: '10:00' });
    settle(fixture);
    expect(component.form.controls.equipmentId.value).toBe('rx2');

    component.form.controls.serviceTypeId.setValue('rx');
    settle(fixture);

    expect(component.form.controls.equipmentId.value).toBe('rx2');
  }));

  it('pide las horas libres una sola vez aunque se siga escribiendo, y no las quita al elegir una', fakeAsync(() => {
    const { fixture, component, api, element } = setup({ equipmentId: 'ct' });
    component.form.controls.serviceTypeId.setValue('tc');
    settle(fixture);

    component.form.patchValue({ patientName: 'Pedro', notes: 'Trae estudios', urgent: true });
    tick(300);
    settle(fixture);
    element.querySelectorAll<HTMLButtonElement>('.chip')[0].click();
    settle(fixture);

    expect(api.slots).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll('.chip').length).toBe(2);
    expect(element.querySelector('.chip.on')?.textContent).toBe('09:00');
  }));

  it('dos pulsaciones seguidas de guardar agendan una sola vez', fakeAsync(() => {
    const { component, api } = setup({ equipmentId: 'ct', clock: '09:00' });
    component.form.patchValue({ serviceTypeId: 'tc', patientName: 'Pedro' });
    api.book.and.returnValue(NEVER);

    component.save();
    component.save();

    expect(api.book).toHaveBeenCalledTimes(1);
    tick(300);
  }));

  it('no deja guardar con una fecha u hora que no se puede leer', fakeAsync(() => {
    const { fixture, component } = setup({ equipmentId: 'ct', clock: '09:00' });
    component.form.patchValue({ serviceTypeId: 'tc', patientName: 'Pedro', date: '20261-12-07' });
    settle(fixture);
    expect(component.canSave()).toBeFalse();

    component.form.patchValue({ date: '2026-12-07', clock: '09:00:30' });
    settle(fixture);
    expect(component.canSave()).toBeFalse();
    tick(300);
  }));

  it('sin servicios en el catálogo lo explica en vez de dejar un formulario que no se puede guardar', () => {
    const { element } = setup({ services: [] });

    expect(element.textContent).toContain('Aún no hay servicios en el catálogo');
  });

  it('busca contactos parecidos al nombre y, al elegir uno, agenda con su id', fakeAsync(() => {
    const { fixture, component, api, ref, element } = setup({ equipmentId: 'ct', clock: '09:00' });
    component.form.controls.serviceTypeId.setValue('tc');
    component.form.controls.patientName.setValue('Mar');
    tick(300);
    settle(fixture);

    expect(api.contacts).toHaveBeenCalledOnceWith('Mar');
    element.querySelector<HTMLButtonElement>('.matches button')?.click();
    settle(fixture);
    expect(element.querySelector('.fixed')?.textContent).toContain('María López');

    component.save();
    expect(api.book).toHaveBeenCalledOnceWith({ equipmentId: 'ct', serviceTypeId: 'tc', startsAt: '2026-12-07T15:00:00.000Z', patientContactId: 'c1' });
    expect(ref.close).toHaveBeenCalledOnceWith(BOOKED as never);
  }));

  it('no busca con menos de dos letras, y un paciente nuevo va con nombre y teléfono', fakeAsync(() => {
    const { fixture, component, api } = setup({ equipmentId: 'ct', clock: '09:00' });
    component.form.patchValue({ serviceTypeId: 'tc', patientName: 'P' });
    tick(300);
    settle(fixture);
    expect(api.contacts).not.toHaveBeenCalled();

    component.form.patchValue({ patientName: 'Pedro Ramírez', patientPhone: '33 1111 2222', urgent: true });
    component.save();

    expect(api.book).toHaveBeenCalledOnceWith(jasmine.objectContaining({ patientName: 'Pedro Ramírez', patientPhone: '33 1111 2222', priority: 'urgent' }));
    tick(300);
  }));

  it('no deja guardar sin paciente, servicio, equipo u hora', fakeAsync(() => {
    const { fixture, component } = setup();
    expect(component.canSave()).toBeFalse();

    component.form.patchValue({ patientName: 'Pedro', serviceTypeId: 'tc' });
    settle(fixture);
    expect(component.canSave()).toBeFalse();

    component.form.controls.clock.setValue('09:00');
    settle(fixture);
    expect(component.canSave()).toBeTrue();
    tick(300);
  }));

  it('si el horario ya está ocupado dice con qué choca, vuelve a pedir las horas libres y elegir una borra el aviso', fakeAsync(() => {
    const { fixture, component, api, ref, element } = setup({ equipmentId: 'ct', clock: '09:00' });
    component.form.patchValue({ serviceTypeId: 'tc', patientName: 'Pedro' });
    settle(fixture);
    const conflict = { code: 'APPOINTMENT_OVERLAP', message: 'x', conflict: { id: 'z', startsAt: '2026-12-07T15:00:00.000Z', endsAt: '2026-12-07T15:15:00.000Z' } };
    api.book.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: conflict })));

    component.save();
    settle(fixture);

    expect(ref.close).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('ya está ocupado por otra cita de 09:00 a 09:15');
    expect(api.slots).toHaveBeenCalledTimes(2);

    element.querySelectorAll<HTMLButtonElement>('.chip')[1].click();
    settle(fixture);
    expect(component.form.controls.clock.value).toBe('09:15');
    expect(element.querySelector('[role="alert"]')).toBeNull();
    tick(300);
  }));

  it('otro rechazo del servidor muestra su mensaje', fakeAsync(() => {
    const { fixture, component, api, element } = setup({ equipmentId: 'ct', clock: '22:00' });
    component.form.patchValue({ serviceTypeId: 'tc', patientName: 'Pedro' });
    api.book.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'La cita queda fuera del horario del equipo.' } })));

    component.save();
    settle(fixture);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('fuera del horario del equipo');
    tick(300);
  }));

  it('al reprogramar solo pide fecha y hora, y mueve la cita sin cambiar paciente ni equipo', fakeAsync(() => {
    const rescheduling = { id: 'a7', equipmentId: 'rx1', serviceTypeId: 'rx', serviceTypeName: 'Rayos X simple', patientName: 'María López' } as AgendaAppointment;
    const { fixture, component, api, element } = setup({ rescheduling, clock: '09:00' });
    settle(fixture);

    expect(element.querySelector('h2')?.textContent).toBe('Reprogramar cita');
    expect(element.querySelector('input[formcontrolname="patientName"]')).toBeNull();
    expect(element.querySelector('.fixed')?.textContent).toContain('María López · Rayos X simple · Rayos X sala 1');
    expect(api.slots).toHaveBeenCalledWith({ equipmentId: 'rx1', serviceTypeId: 'rx', date: '2026-12-07' });

    component.form.patchValue({ date: '2026-12-08', clock: '10:30' });
    component.save();

    expect(api.reschedule).toHaveBeenCalledOnceWith('a7', { startsAt: '2026-12-08T16:30:00.000Z' });
    expect(api.book).not.toHaveBeenCalled();
  }));
});
