import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AgendaDay, AgendaLane } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { AppointmentDetailDialogComponent } from './appointment-detail.dialog';
import { BookAppointmentDialogComponent } from './book-appointment.dialog';
import { AgendaComponent } from './agenda.component';
import { DEFAULT_TIME_ZONE, shiftDate, todayIn } from './agenda.helpers';

const lane = (patch: Partial<AgendaLane> = {}): AgendaLane => ({
  id: 'ct',
  establishmentId: 'est-1',
  name: 'Tomógrafo',
  modality: 'ct',
  room: 'Sala 1',
  timeZone: DEFAULT_TIME_ZONE,
  dayStartsAt: '2026-12-07T06:00:00.000Z',
  dayEndsAt: '2026-12-08T06:00:00.000Z',
  hours: [{ opensAt: '08:00', closesAt: '14:00' }],
  blocks: [{ id: 'b1', startsAt: '2026-12-07T18:00:00.000Z', endsAt: '2026-12-07T19:00:00.000Z', reason: 'Mantenimiento' }],
  appointments: [
    {
      id: 'a1',
      equipmentId: 'ct',
      serviceTypeId: 's1',
      serviceTypeName: 'Tomografía contrastada',
      patientContactId: 'c1',
      startsAt: '2026-12-07T15:00:00.000Z',
      endsAt: '2026-12-07T15:15:00.000Z',
      state: 'arrived',
      priority: 'urgent',
      patientName: 'María López',
      patientPhone: null,
      notes: null,
      arrivedAt: null,
      cancelReason: null,
    },
  ],
  ...patch,
});

const SERVICES = [{ id: 's1', name: 'Tomografía contrastada', modality: 'ct', durationMinutes: 15, preparation: null }];

function setup(
  day: (date: string) => Observable<AgendaDay>,
  establishment: { id: string; timeZone: string } | null = { id: 'est-1', timeZone: DEFAULT_TIME_ZONE },
  canManage = false,
  closesWith: unknown = undefined,
) {
  const api = { day: jasmine.createSpy('day').and.callFake(day), serviceTypes: () => of(SERVICES) };
  const dialog = { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(closesWith) }) };
  const snack = { open: jasmine.createSpy('snack').and.returnValue({ onAction: () => of() }) };
  TestBed.configureTestingModule({
    imports: [AgendaComponent],
    providers: [
      provideRouter([]),
      { provide: AgendaApiService, useValue: api },
      { provide: EstablishmentContextService, useValue: { current: () => establishment } },
      { provide: PermissionsService, useValue: { can: () => canManage } },
      { provide: MatDialog, useValue: dialog },
      { provide: MatSnackBar, useValue: snack },
    ],
  });
  const fixture = TestBed.createComponent(AgendaComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const text = () => (fixture.detectChanges(), element.textContent ?? '');
  return { fixture, api, element, text, dialog, snack };
}

const dayWith = (...resources: AgendaLane[]) => (date: string) => of({ date, resources });

describe('AgendaComponent', () => {
  it('pide el día de hoy y pinta un carril por equipo con su cita', () => {
    const { api, element, text } = setup(dayWith(lane()));

    expect(api.day).toHaveBeenCalledOnceWith(todayIn(DEFAULT_TIME_ZONE));
    expect(text()).toContain('Tomógrafo');
    expect(text()).toContain('Sala 1 · 1 cita · 09:00–09:15');
    const appointment = element.querySelector('.appointment');
    expect(appointment?.querySelector('.visually-hidden')?.textContent).toBe('09:00–09:15, María López, Tomografía contrastada, Urgente, Llegó');
    expect(appointment?.querySelector('.line')?.getAttribute('aria-hidden')).toBe('true');
    expect(appointment?.classList).toContain('arrived');
    expect(appointment?.classList).toContain('urgent');
  });

  it('resume el día y rotula bloqueos y horas fuera de horario', () => {
    const { text } = setup(dayWith(lane()));

    expect(text()).toContain('1 cita · 1 llegó · 1 urgente');
    expect(text()).toContain('Bloqueado: Mantenimiento');
    expect(text()).toContain('Fuera de horario');
  });

  it('«hoy» es la fecha del establecimiento: de noche en Tijuana aún no es mañana', () => {
    jasmine.clock().install();
    // 06:30Z del día 8: 00:30 en Ciudad de México, pero 22:30 del día 7 en Tijuana.
    jasmine.clock().mockDate(new Date('2026-12-08T06:30:00.000Z'));
    try {
      const { api, element } = setup(dayWith(lane()), { id: 'est-1', timeZone: 'America/Tijuana' });

      expect(api.day).toHaveBeenCalledOnceWith('2026-12-07');
      expect(element.querySelector<HTMLButtonElement>('.days button:nth-child(2)')?.disabled).toBeTrue();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('mientras no se conoce el establecimiento no pide nada ni pinta carriles de otros', () => {
    const { api, element, text } = setup(dayWith(lane()), null);

    expect(api.day).not.toHaveBeenCalled();
    expect(text()).toContain('Cargando la agenda…');
    expect(element.querySelector('.board')).toBeNull();
  });

  it('el selector de fecha salta a ese día y vaciarlo no cambia nada', () => {
    const { fixture, api, element } = setup(dayWith(lane()));
    const input = element.querySelector<HTMLInputElement>('input[type="date"]')!;

    input.value = '2026-12-24';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.day.calls.mostRecent().args).toEqual(['2026-12-24']);
    expect(element.querySelector('.date')?.textContent).toBe('Jueves 24 de diciembre de 2026');

    input.value = '';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.day).toHaveBeenCalledTimes(2);
  });

  it('un bloqueo fuera del horario se alcanza a ver', () => {
    const evening = { id: 'b2', startsAt: '2026-12-07T22:00:00.000Z', endsAt: '2026-12-08T00:00:00.000Z', reason: 'Calibración' };
    const { element } = setup(dayWith(lane({ blocks: [evening] })));

    expect(element.querySelector('.band.blocked')?.textContent).toContain('Bloqueado: Calibración');
  });

  it('solo muestra los equipos del establecimiento elegido', () => {
    const { text } = setup(dayWith(lane(), lane({ id: 'rx', name: 'Rayos X de otra sucursal', establishmentId: 'est-2', appointments: [] })));

    expect(text()).not.toContain('Rayos X de otra sucursal');
  });

  it('un día sin citas lo dice y conserva la parrilla', () => {
    const { element, text } = setup(dayWith(lane({ appointments: [] })));

    expect(text()).toContain('No hay citas para este día.');
    expect(element.querySelector('.board')).not.toBeNull();
  });

  it('sin equipos en el establecimiento manda a darlos de alta', () => {
    const { element, text } = setup(dayWith());

    expect(text()).toContain('aún no tiene equipos');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/operacion/equipos-y-personal');
  });

  it('«Siguiente» y «Anterior» piden el día contiguo, y «Hoy» regresa', () => {
    const { fixture, api } = setup(dayWith(lane()));
    const today = todayIn(DEFAULT_TIME_ZONE);
    const [previous, todayButton, next] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.days button'));

    expect(todayButton.disabled).toBeTrue();
    next.click();
    fixture.detectChanges();
    expect(api.day.calls.mostRecent().args).toEqual([shiftDate(today, 1)]);
    expect(todayButton.disabled).toBeFalse();
    previous.click();
    previous.click();
    fixture.detectChanges();
    expect(api.day.calls.mostRecent().args).toEqual([shiftDate(today, -1)]);
    todayButton.click();
    fixture.detectChanges();
    expect(api.day.calls.mostRecent().args).toEqual([today]);
  });

  it('sin permiso de agendar no ofrece «Agendar cita», pero sí abre el detalle en solo lectura', () => {
    const { element, dialog } = setup(dayWith(lane()));

    expect(element.querySelector('.new')).toBeNull();
    element.querySelector<HTMLButtonElement>('.appointment .card')?.click();

    const [component, config] = dialog.open.calls.mostRecent().args;
    expect(component).toBe(AppointmentDetailDialogComponent);
    expect(config.data).toEqual(jasmine.objectContaining({ canManage: false, appointment: jasmine.objectContaining({ id: 'a1' }) }));
    expect(config.position).toEqual({ top: '0', right: '0' });
  });

  it('«Agendar cita» abre el diálogo con el día, la zona, los equipos y el catálogo', () => {
    const { element, dialog } = setup(dayWith(lane()), undefined, true);

    element.querySelector<HTMLButtonElement>('.new')?.click();

    const [component, config] = dialog.open.calls.mostRecent().args;
    expect(component).toBe(BookAppointmentDialogComponent);
    expect(config.data).toEqual(jasmine.objectContaining({ date: todayIn(DEFAULT_TIME_ZONE), timeZone: DEFAULT_TIME_ZONE, services: SERVICES }));
    expect(config.data.lanes.map((l: AgendaLane) => l.id)).toEqual(['ct']);
  });

  it('un clic en el carril propone ese equipo y esa hora, ajustada a 5 minutos', () => {
    const { fixture, dialog } = setup(dayWith(lane()), undefined, true);

    // La ventana empieza a las 08:00 a 1.6 px por minuto: 84 px son 52.5 min, que se ajustan a las 08:50.
    fixture.componentInstance.bookAt(lane(), 84);

    expect(dialog.open.calls.mostRecent().args[1].data).toEqual(jasmine.objectContaining({ equipmentId: 'ct', clock: '08:50' }));
  });

  it('al agendar recarga el día y avisa, con el aviso del mismo paciente si lo hay', () => {
    const booked = {
      ...lane().appointments[0],
      warnings: [{ code: 'PATIENT_OVERLAP', appointment: { id: 'x', equipmentId: 'ct', startsAt: '2026-12-07T15:00:00.000Z', endsAt: '2026-12-07T15:30:00.000Z' } }],
    };
    const { fixture, element, api, snack } = setup(dayWith(lane()), undefined, true, booked);

    element.querySelector<HTMLButtonElement>('.new')?.click();
    fixture.detectChanges();

    expect(api.day).toHaveBeenCalledTimes(2);
    const [message, action] = snack.open.calls.mostRecent().args;
    expect(message).toBe('Cita agendada: 09:00, María López. Este paciente ya tiene otra cita a esa hora: 09:00 en Tomógrafo.');
    expect(action).toBe('Agendar otra para este paciente');
  });

  it('si el detalle cambió la cita, recarga; si pidió reprogramar, abre el diálogo para moverla', () => {
    const changed = setup(dayWith(lane()), undefined, true, 'changed');
    changed.element.querySelector<HTMLButtonElement>('.appointment .card')?.click();
    changed.fixture.detectChanges();
    expect(changed.api.day).toHaveBeenCalledTimes(2);

    TestBed.resetTestingModule();
    const moving = setup(dayWith(lane()), undefined, true, 'reschedule');
    moving.dialog.open.and.returnValues({ afterClosed: () => of('reschedule') }, { afterClosed: () => of(undefined) });
    moving.element.querySelector<HTMLButtonElement>('.appointment .card')?.click();

    const [component, config] = moving.dialog.open.calls.mostRecent().args;
    expect(component).toBe(BookAppointmentDialogComponent);
    expect(config.data).toEqual(jasmine.objectContaining({ clock: '09:00', rescheduling: jasmine.objectContaining({ id: 'a1' }) }));
  });

  it('si la carga falla lo avisa y deja volver a intentar', () => {
    let fail = true;
    const { fixture, api, element, text } = setup((date) => (fail ? throwError(() => new Error('500')) : dayWith(lane())(date)));

    expect(text()).toContain('No pudimos cargar la agenda de este día.');
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    fail = false;
    element.querySelector<HTMLButtonElement>('.notice button')?.click();
    fixture.detectChanges();

    expect(api.day).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Tomógrafo');
  });
});
