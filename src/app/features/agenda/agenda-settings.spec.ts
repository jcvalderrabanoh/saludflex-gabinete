import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AgendaResource, AgendaServiceType } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { AgendaHoursComponent } from './agenda-hours.component';
import { AgendaServicesComponent } from './agenda-services.component';
import { ServiceTypeDialogComponent } from './service-type.dialog';

const SERVICE: AgendaServiceType = { id: 's1', name: 'Tomografía contrastada', modality: 'ct', durationMinutes: 15, preparation: null };
const resource = (patch: Partial<AgendaResource> = {}): AgendaResource => ({
  id: 'ct',
  establishmentId: 'est-1',
  name: 'Tomógrafo',
  modality: 'ct',
  room: null,
  hours: [{ weekday: 1, opensAt: '08:00', closesAt: '14:00' }],
  ...patch,
});

describe('AgendaServicesComponent', () => {
  function setup(services: AgendaServiceType[], closesWith: unknown = undefined) {
    const api = jasmine.createSpyObj<AgendaApiService>('AgendaApiService', { serviceTypes: of(services), removeServiceType: of(undefined) });
    const dialog = { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(closesWith) }) };
    TestBed.configureTestingModule({ imports: [AgendaServicesComponent], providers: [{ provide: AgendaApiService, useValue: api }, { provide: MatDialog, useValue: dialog }] });
    const fixture = TestBed.createComponent(AgendaServicesComponent);
    fixture.detectChanges();
    return { fixture, api, dialog, element: fixture.nativeElement as HTMLElement };
  }

  it('lista cada servicio con su modalidad, duración e indicaciones, o dice que no tiene', () => {
    const { element } = setup([SERVICE]);

    expect(element.textContent).toContain('Tomografía contrastada');
    expect(element.textContent).toContain('Tomografía · 15 min');
    expect(element.textContent).toContain('Sin indicaciones para el paciente');
  });

  it('sin servicios lo dice e invita a agregar el primero', () => {
    expect(setup([]).element.textContent).toContain('Aún no hay servicios');
  });

  it('editar abre el diálogo con ese servicio y recarga la lista al guardar', () => {
    const { api, dialog, element } = setup([SERVICE], SERVICE);

    element.querySelector<HTMLButtonElement>('li button')?.click();

    const [component, config] = dialog.open.calls.mostRecent().args;
    expect(component).toBe(ServiceTypeDialogComponent);
    expect(config.data).toEqual({ editing: SERVICE });
    expect(api.serviceTypes).toHaveBeenCalledTimes(2);
  });

  it('quitar pide confirmación; si se niega no borra nada', () => {
    const { api, element } = setup([SERVICE]);
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    const remove = element.querySelectorAll<HTMLButtonElement>('li button')[1];

    remove.click();
    expect(api.removeServiceType).not.toHaveBeenCalled();

    confirm.and.returnValue(true);
    remove.click();
    expect(api.removeServiceType).toHaveBeenCalledOnceWith('s1');
  });
});

describe('ServiceTypeDialogComponent', () => {
  function setup(editing?: AgendaServiceType) {
    const api = jasmine.createSpyObj<AgendaApiService>('AgendaApiService', { createServiceType: of(SERVICE), updateServiceType: of(SERVICE) });
    const ref = { close: jasmine.createSpy('close') };
    TestBed.configureTestingModule({
      imports: [ServiceTypeDialogComponent],
      providers: [provideNoopAnimations(), { provide: AgendaApiService, useValue: api }, { provide: MatDialogRef, useValue: ref }, { provide: MAT_DIALOG_DATA, useValue: { editing } }],
    });
    const fixture = TestBed.createComponent(ServiceTypeDialogComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api, ref, element: fixture.nativeElement as HTMLElement };
  }

  it('no deja guardar sin nombre, sin modalidad o con una duración fuera de 1 a 480', () => {
    const { component, api } = setup();

    component.form.patchValue({ name: '   ', modality: 'ct' });
    expect(component.form.invalid).toBeTrue();
    component.form.patchValue({ name: 'Rayos X', durationMinutes: 0 });
    expect(component.form.invalid).toBeTrue();
    component.form.patchValue({ durationMinutes: 481 });
    expect(component.form.invalid).toBeTrue();
    component.save();
    expect(api.createServiceType).not.toHaveBeenCalled();
  });

  it('crea el servicio con el nombre recortado y las indicaciones vacías como nulas', () => {
    const { component, api, ref } = setup();
    component.form.patchValue({ name: ' Rayos X simple ', modality: 'xray', durationMinutes: 30, preparation: '  ' });

    component.save();

    expect(api.createServiceType).toHaveBeenCalledOnceWith({ name: 'Rayos X simple', modality: 'xray', durationMinutes: 30, preparation: null });
    expect(ref.close).toHaveBeenCalledOnceWith(SERVICE);
  });

  it('al editar actualiza ese servicio, y un nombre repetido muestra el mensaje del servidor', () => {
    const { fixture, component, api, ref, element } = setup(SERVICE);
    api.updateServiceType.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Ya existe un servicio llamado «X».' } })));
    component.form.patchValue({ name: 'X' });

    component.save();
    fixture.detectChanges();

    expect(api.updateServiceType).toHaveBeenCalledOnceWith('s1', jasmine.objectContaining({ name: 'X', modality: 'ct' }));
    expect(ref.close).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Ya existe un servicio');
  });
});

describe('AgendaHoursComponent', () => {
  function setup(resources: AgendaResource[]) {
    const api = jasmine.createSpyObj<AgendaApiService>('AgendaApiService', {
      resources: of(resources),
      blocks: of([{ id: 'b1', startsAt: '2026-12-07T22:00:00.000Z', endsAt: '2026-12-08T00:00:00.000Z', reason: 'Mantenimiento' }]),
      replaceHours: of([]),
      createBlock: of({ id: 'b2', startsAt: '', endsAt: '', reason: '' }),
      removeBlock: of(undefined),
    });
    const snack = { open: jasmine.createSpy('open') };
    TestBed.configureTestingModule({
      imports: [AgendaHoursComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AgendaApiService, useValue: api },
        { provide: MatSnackBar, useValue: snack },
        { provide: EstablishmentContextService, useValue: { current: () => ({ id: 'est-1', timeZone: 'America/Mexico_City' }) } },
      ],
    });
    const fixture = TestBed.createComponent(AgendaHoursComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    return { fixture, component: fixture.componentInstance, api, snack, element, button };
  }

  it('muestra el horario del primer equipo del establecimiento y sus bloqueos próximos', () => {
    const { component, api, element } = setup([resource(), resource({ id: 'otro', name: 'De otra sucursal', establishmentId: 'est-2' })]);

    expect(component.own().map((r) => r.id)).toEqual(['ct']);
    expect(component.week()[0].intervals).toEqual([{ opensAt: '08:00', closesAt: '14:00' }]);
    expect(api.blocks).toHaveBeenCalledOnceWith('ct');
    expect(element.querySelector('.blocks')?.textContent).toContain('lun 7 dic, 16:00 a 18:00 · Mantenimiento');
  });

  it('sin equipos en el establecimiento manda a darlos de alta', () => {
    const { element } = setup([]);

    expect(element.textContent).toContain('aún no tiene equipos');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/operacion/equipos-y-personal');
  });

  it('«Guardar horario» solo se activa con cambios válidos y manda la semana completa', () => {
    const { fixture, component, api, snack, button } = setup([resource()]);
    expect(button('Guardar horario').disabled).toBeTrue();

    component.addInterval(component.week()[1]);
    fixture.detectChanges();
    expect(component.problem()).toBe('Martes: falta la hora de apertura o de cierre.');
    expect(button('Guardar horario').disabled).toBeTrue();

    component.week()[1].intervals[0] = { opensAt: '09:00', closesAt: '00:00' };
    component.touch();
    fixture.detectChanges();
    button('Guardar horario').click();

    expect(api.replaceHours).toHaveBeenCalledOnceWith('ct', [
      { weekday: 1, opensAt: '08:00', closesAt: '14:00' },
      { weekday: 2, opensAt: '09:00', closesAt: '24:00' },
    ]);
    expect(snack.open.calls.mostRecent().args[0]).toBe('Horario de Tomógrafo guardado.');
    expect(component.dirty()).toBeFalse();
  });

  it('bloquea el equipo con las horas del establecimiento convertidas a instantes', () => {
    const { component, api } = setup([resource()]);
    component.blockForm.setValue({ from: '2026-12-07T16:00', to: '2026-12-07T18:00', reason: ' Mantenimiento ' });

    component.addBlock(resource());

    expect(api.createBlock).toHaveBeenCalledOnceWith('ct', { startsAt: '2026-12-07T22:00:00.000Z', endsAt: '2026-12-08T00:00:00.000Z', reason: 'Mantenimiento' });
    expect(api.blocks).toHaveBeenCalledTimes(2);
  });

  it('no manda un bloqueo que termina antes de empezar', () => {
    const { component, api } = setup([resource()]);
    component.blockForm.setValue({ from: '2026-12-07T18:00', to: '2026-12-07T16:00', reason: 'Obra' });

    component.addBlock(resource());

    expect(api.createBlock).not.toHaveBeenCalled();
    expect(component.blockError()).toBe('El bloqueo debe terminar después de que empieza.');
  });

  it('quitar un bloqueo pide confirmación', () => {
    const { api, element } = setup([resource()]);
    spyOn(window, 'confirm').and.returnValue(true);

    element.querySelector<HTMLButtonElement>('.blocks button')?.click();

    expect(api.removeBlock).toHaveBeenCalledOnceWith('ct', 'b1');
  });
});
