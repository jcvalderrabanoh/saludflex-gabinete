import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { EMPTY, NEVER, Observable, of, throwError } from 'rxjs';
import { AgendaAppointment, AgendaLane, AgendaServiceType } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { AgendaCatalogService } from './agenda-catalog.service';
import { ADD_NEW, BookAppointmentData, BookAppointmentDialogComponent } from './book-appointment.dialog';

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
const ULTRASOUND: AgendaServiceType = { id: 'us', name: 'Ultrasonido abdominal', modality: 'ultrasound', durationMinutes: 20, preparation: null };

interface CatalogOptions {
  services?: boolean;
  equipment?: boolean;
}

function setup(data: Partial<BookAppointmentData> = {}, can: CatalogOptions = {}) {
  const catalog = {
    canEditServices: () => !!can.services,
    canEditEquipment: () => !!can.equipment,
    addService: jasmine.createSpy('addService').and.returnValue(EMPTY as Observable<unknown>),
    editService: jasmine.createSpy('editService').and.returnValue(EMPTY as Observable<unknown>),
    addEquipment: jasmine.createSpy('addEquipment').and.returnValue(EMPTY as Observable<unknown>),
    editEquipment: jasmine.createSpy('editEquipment').and.returnValue(EMPTY as Observable<unknown>),
  };
  const api = {
    day: jasmine.createSpy('day').and.returnValue(of({ date: '2026-12-07', resources: LANES })),
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
      provideRouter([]),
      { provide: AgendaApiService, useValue: api },
      { provide: AgendaCatalogService, useValue: catalog },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: { date: '2026-12-07', timeZone: MX, establishmentId: 'est', lanes: LANES, services: SERVICES, ...data } },
    ],
  });
  const fixture = TestBed.createComponent(BookAppointmentDialogComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, api, catalog, ref, element: fixture.nativeElement as HTMLElement };
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

  it('un servicio sin equipo de su modalidad dice por qué no se puede agendar y a quién pedirlo', fakeAsync(() => {
    const { fixture, component, api, element } = setup({ services: [...SERVICES, ULTRASOUND] });

    component.form.controls.serviceTypeId.setValue('us');
    settle(fixture);

    const note = element.querySelector('.no-place');
    expect(note?.textContent).toContain('No hay equipos de Ultrasonido en este establecimiento.');
    expect(note?.textContent).toContain('Pide a quien administra la agenda');
    expect(note?.querySelector('button')).toBeNull();
    expect(api.slots).not.toHaveBeenCalled();
    expect(component.canSave()).toBeFalse();
  }));

  describe('agregar y editar desde las listas, con permiso', () => {
    const optionTexts = (fixture: ComponentFixture<unknown>, index: number): string[] => {
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('mat-select .mat-mdc-select-trigger')[index].click();
      fixture.detectChanges();
      // La etiqueta, sin el texto del ícono decorativo.
      return Array.from(document.querySelectorAll('mat-option')).map((option) =>
        Array.from(option.querySelectorAll('.mdc-list-item__primary-text'), (label) => Array.from(label.childNodes).filter((node) => node.nodeName !== 'MAT-ICON').map((node) => node.textContent).join('').trim()).join(''),
      );
    };

    it('sin permiso las listas solo traen lo que hay', fakeAsync(() => {
      const { fixture } = setup();

      expect(optionTexts(fixture, 0)).not.toContain('Agregar servicio…');
      flush();
    }));

    it('la lista de servicios trae «Agregar servicio…»; el nuevo queda en la lista y elegido', fakeAsync(() => {
      const { fixture, component, catalog } = setup({}, { services: true });
      expect(optionTexts(fixture, 0)).toContain('Agregar servicio…');
      catalog.addService.and.returnValue(of(ULTRASOUND));

      component.pickService(ADD_NEW);
      settle(fixture);

      expect(catalog.addService).toHaveBeenCalledWith('est', LANES);
      expect(component.services().map((s) => s.id)).toContain('us');
      expect(component.form.controls.serviceTypeId.value).toBe('us');
      flush();
    }));

    it('cancelar «Agregar servicio…» deja el servicio que estaba', fakeAsync(() => {
      const { fixture, component } = setup({}, { services: true });
      component.form.controls.serviceTypeId.setValue('rx');
      settle(fixture);

      component.form.controls.serviceTypeId.setValue(ADD_NEW);
      component.pickService(ADD_NEW);
      settle(fixture);

      expect(component.form.controls.serviceTypeId.value).toBe('rx');
    }));

    it('el servicio elegido se edita ahí mismo y se ve con sus datos nuevos', fakeAsync(() => {
      const { fixture, component, catalog, element } = setup({}, { services: true });
      component.form.controls.serviceTypeId.setValue('rx');
      settle(fixture);
      catalog.editService.and.returnValue(of({ ...SERVICES[1], durationMinutes: 45 }));

      (element.querySelector('button[aria-label="Editar servicio Rayos X simple"]') as HTMLButtonElement).click();
      settle(fixture);

      expect(catalog.editService).toHaveBeenCalledWith(SERVICES[1], 'est', LANES);
      expect(component.service()?.durationMinutes).toBe(45);
    }));

    it('sin catálogo ofrece agregar el primer servicio', fakeAsync(() => {
      const { fixture, catalog, element } = setup({ services: [] }, { services: true });

      (element.querySelector('[role="alert"] button') as HTMLButtonElement).click();
      settle(fixture);

      expect(catalog.addService).toHaveBeenCalled();
    }));

    it('sin equipo para el servicio ofrece agregar uno de su modalidad; al guardarlo queda elegido', fakeAsync(() => {
      const { fixture, component, api, catalog, element } = setup({ services: [...SERVICES, ULTRASOUND] }, { equipment: true });
      component.form.controls.serviceTypeId.setValue('us');
      settle(fixture);
      const added = lane('us1', 'Ultrasonido 1', 'ultrasound');
      api.day.and.returnValue(of({ date: '2026-12-07', resources: [...LANES, added, { ...lane('otro', 'De otra sucursal', 'ultrasound'), establishmentId: 'otra' }] }));
      catalog.addEquipment.and.returnValue(of({ equipmentId: 'us1', name: 'Ultrasonido 1', created: true, hoursSaved: true, activated: 0 }));

      (element.querySelector('.no-place button') as HTMLButtonElement).click();
      settle(fixture);

      expect(catalog.addEquipment).toHaveBeenCalledWith('est', 'ultrasound');
      expect(api.day).toHaveBeenCalledWith('2026-12-07');
      expect(component.equipment().map((l) => l.id)).toEqual(['us1']);
      expect(component.form.controls.equipmentId.value).toBe('us1');
      expect(element.querySelector('.no-place')).toBeNull();
    }));

    it('la lista de equipos trae «Agregar equipo…» y el elegido se edita ahí mismo', fakeAsync(() => {
      const { fixture, component, catalog, element } = setup({}, { equipment: true });
      expect(optionTexts(fixture, 1)).toContain('Agregar equipo…');
      flush();

      component.form.controls.equipmentId.setValue('rx1');
      settle(fixture);
      (element.querySelector('button[aria-label="Editar equipo Rayos X sala 1"]') as HTMLButtonElement).click();

      expect(catalog.editEquipment).toHaveBeenCalledWith('est', jasmine.objectContaining({ id: 'rx1' }));
    }));
  });

  it('un servicio con equipo no muestra el aviso', fakeAsync(() => {
    const { fixture, component, element } = setup();

    component.form.controls.serviceTypeId.setValue('rx');
    settle(fixture);

    expect(element.querySelector('.no-place')).toBeNull();
  }));

  it('sin servicio elegido ofrece todos los equipos y deja ver el del carril donde se hizo clic', fakeAsync(() => {
    const { fixture, component, element } = setup({ equipmentId: 'rx2', clock: '10:00' });
    settle(fixture);

    expect(component.equipment().map((l) => l.id)).toEqual(['ct', 'rx1', 'rx2']);
    const shown = Array.from(element.querySelectorAll('mat-select')).map((select) => select.textContent?.trim());
    expect(shown).toContain('Rayos X sala 2');
  }));

  it('se puede elegir primero el equipo y después un servicio que cabe en él', fakeAsync(() => {
    const { fixture, component } = setup();

    component.form.controls.equipmentId.setValue('rx1');
    settle(fixture);
    expect(component.form.controls.equipmentId.value).toBe('rx1');

    component.form.controls.serviceTypeId.setValue('rx');
    settle(fixture);

    expect(component.form.controls.equipmentId.value).toBe('rx1');
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
