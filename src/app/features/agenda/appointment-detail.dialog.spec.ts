import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { AgendaAppointment, AgendaLane } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { AppointmentDetailDialogComponent } from './appointment-detail.dialog';

const appointment = (patch: Partial<AgendaAppointment> = {}): AgendaAppointment => ({
  id: 'a1',
  equipmentId: 'ct',
  serviceTypeId: 'tc',
  serviceTypeName: 'Tomografía contrastada',
  patientContactId: 'c1',
  startsAt: '2026-12-07T15:00:00.000Z',
  endsAt: '2026-12-07T15:15:00.000Z',
  state: 'scheduled',
  priority: 'normal',
  patientName: 'María López',
  patientPhone: null,
  notes: null,
  arrivedAt: null,
  cancelReason: null,
  ...patch,
});

function setup(current: AgendaAppointment, canManage = true) {
  const other = appointment({ id: 'a2', equipmentId: 'rx', startsAt: '2026-12-07T17:00:00.000Z', endsAt: '2026-12-07T17:30:00.000Z' });
  const lane = (id: string, name: string, appointments: AgendaAppointment[]): AgendaLane => ({
    id,
    establishmentId: 'est',
    name,
    modality: 'ct',
    room: 'Sala 1',
    timeZone: 'America/Mexico_City',
    dayStartsAt: '2026-12-07T06:00:00.000Z',
    dayEndsAt: '2026-12-08T06:00:00.000Z',
    hours: [],
    blocks: [],
    appointments,
  });
  const lanes = [lane('ct', 'Tomógrafo', [current]), lane('rx', 'Rayos X', [other])];
  const api = jasmine.createSpyObj<AgendaApiService>('AgendaApiService', { arrive: of(current), attend: of(current), noShow: of(current), cancel: of(current) });
  const ref = { close: jasmine.createSpy('close'), disableClose: false };
  TestBed.configureTestingModule({
    imports: [AppointmentDetailDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: AgendaApiService, useValue: api },
      { provide: MatDialogRef, useValue: ref },
      {
        provide: MAT_DIALOG_DATA,
        useValue: { appointment: current, lane: lanes[0], lanes, services: [{ id: 'tc', name: 'TC', modality: 'ct', durationMinutes: 15, preparation: 'Ayuno de 6 horas' }], canManage },
      },
    ],
  });
  const fixture = TestBed.createComponent(AppointmentDetailDialogComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const actions = () => Array.from(element.querySelectorAll<HTMLButtonElement>('mat-dialog-actions button'));
  const press = (label: string) => {
    actions().find((button) => button.textContent?.includes(label))?.click();
    fixture.detectChanges();
  };
  return { fixture, api, ref, element, press, labels: () => actions().map((button) => button.textContent?.replace(/^[a-z_]+ /, '').trim()) };
}

describe('AppointmentDetailDialogComponent', () => {
  it('muestra los datos, «Sin dato» donde falta, las indicaciones y las otras citas del paciente', () => {
    const { element } = setup(appointment());
    const text = element.textContent ?? '';

    expect(element.querySelector('h2')?.textContent).toBe('María López');
    expect(text).toContain('09:00–09:15');
    expect(text).toContain('Tomógrafo · Sala 1');
    expect(text).toContain('Sin dato');
    expect(text).toContain('Ayuno de 6 horas');
    expect(element.querySelector('.others')?.textContent).toContain('11:00 · Rayos X · Programada');
  });

  it('una cita programada ofrece llegada como acción principal, y reprogramar, ausencia y cancelar', () => {
    const { labels } = setup(appointment());

    expect(labels()).toEqual(['Marcar llegada', 'Reprogramar', 'No se presentó', 'Cancelar cita', 'Cerrar']);
  });

  it('una cita con llegada ofrece marcarla atendida o cancelarla', () => {
    const { labels, element } = setup(appointment({ state: 'arrived', arrivedAt: '2026-12-07T14:55:00.000Z' }));

    expect(labels()).toEqual(['Marcar atendida', 'Cancelar cita', 'Cerrar']);
    expect(element.textContent).toContain('08:55');
  });

  it('una cita en estado final, o sin permiso de agendar, solo se puede cerrar', () => {
    expect(setup(appointment({ state: 'attended' })).labels()).toEqual(['Cerrar']);
    TestBed.resetTestingModule();
    expect(setup(appointment(), false).labels()).toEqual(['Cerrar']);
  });

  it('marcar la llegada avisa a la agenda para que se recargue', () => {
    const { api, ref, press } = setup(appointment());

    press('Marcar llegada');

    expect(api.arrive).toHaveBeenCalledOnceWith('a1');
    expect(ref.close).toHaveBeenCalledOnceWith('changed');
  });

  it('reprogramar cierra el detalle pidiendo abrir el diálogo para moverla', () => {
    const { ref, press } = setup(appointment());

    press('Reprogramar');

    expect(ref.close).toHaveBeenCalledOnceWith('reschedule');
  });

  it('cancelar pide confirmación y manda el motivo; «No cancelar» regresa sin tocar nada', () => {
    const { fixture, api, ref, press, labels } = setup(appointment());

    press('Cancelar cita');
    expect(api.cancel).not.toHaveBeenCalled();
    expect(labels()).toEqual(['No cancelar', 'Sí, cancelar la cita']);
    press('No cancelar');
    expect(labels()).toContain('Marcar llegada');

    press('Cancelar cita');
    fixture.componentInstance.reason.setValue('  El paciente avisó ');
    press('Sí, cancelar la cita');

    expect(api.cancel).toHaveBeenCalledOnceWith('a1', 'El paciente avisó');
    expect(ref.close).toHaveBeenCalledOnceWith('changed');
  });

  it('si la cita ya cambió en el servidor lo dice, quita las acciones y al cerrar la agenda se recarga', () => {
    const { api, ref, element, press, labels } = setup(appointment());
    api.noShow.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'La cita ya cambió de estado.' } })));

    press('No se presentó');

    expect(ref.close).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('La cita ya cambió de estado.');
    expect(labels()).toEqual(['Cerrar']);
    press('Cerrar');
    expect(ref.close).toHaveBeenCalledOnceWith('changed');
  });

  it('si falla por otra cosa muestra el mensaje y deja reintentar', () => {
    const { api, ref, element, press, labels } = setup(appointment());
    api.arrive.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    press('Marcar llegada');

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No hay conexión con el servidor.');
    expect(labels()).toContain('Marcar llegada');
    press('Cerrar');
    expect(ref.close).toHaveBeenCalledOnceWith(undefined);
  });

  it('dos pulsaciones seguidas mandan la acción una sola vez', () => {
    const { fixture } = setup(appointment());
    let subscriptions = 0;
    const action = new Observable<AgendaAppointment>(() => void subscriptions++);

    fixture.componentInstance.run(action);
    fixture.componentInstance.run(action);

    expect(subscriptions).toBe(1);
  });
});
