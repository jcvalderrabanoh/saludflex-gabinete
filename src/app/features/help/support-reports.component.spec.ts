import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TicketDetail, TicketSummary } from './help.models';
import { SupportReportsComponent } from './support-reports.component';
import { SupportTicketsService } from './support-tickets.service';

const summary = (overrides: Partial<TicketSummary> = {}): TicketSummary => ({
  id: 't1',
  title: 'No guarda la cita',
  status: 'open',
  type: 'bug',
  createdAt: '2026-11-14T10:00:00Z',
  unread: false,
  isMine: true,
  reporterEmail: null,
  followUpOfTicketId: null,
  ...overrides,
});

const detail = (overrides: Partial<TicketDetail> = {}): TicketDetail => ({
  ...summary(),
  reportText: 'Al guardar sale error',
  resolvedAt: null,
  canAddInfo: true,
  canClose: true,
  canReopen: false,
  reopenUntil: null,
  reopenCreatesFollowUp: false,
  messages: [{ id: 'm1', author: 'support', kind: 'comment', body: 'Ya lo estamos revisando', createdAt: '2026-11-14T11:00:00Z' }],
  ...overrides,
});

describe('Mis reportes (Gabinete)', () => {
  let tickets: jasmine.SpyObj<SupportTicketsService>;

  const button = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim().includes(text));

  function render() {
    const fixture = TestBed.createComponent(SupportReportsComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function type(el: HTMLElement, selector: string, value: string) {
    const field = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  beforeEach(() => {
    tickets = jasmine.createSpyObj<SupportTicketsService>('SupportTicketsService', ['mine', 'detail', 'create', 'addInfo', 'close', 'unreadCount']);
    tickets.mine.and.returnValue(of([summary(), summary({ id: 't2', title: 'Duda con la carpeta', status: 'resolved', unread: true })]));
    tickets.detail.and.returnValue(of(detail()));
    tickets.create.and.returnValue(of({ success: true, ticketId: 't3', error: null }));
    tickets.addInfo.and.returnValue(of(detail()));
    tickets.close.and.returnValue(of(detail({ status: 'closed', canClose: false, canAddInfo: false })));
    TestBed.configureTestingModule({
      imports: [SupportReportsComponent],
      providers: [provideRouter([]), { provide: SupportTicketsService, useValue: tickets }],
    });
  });

  it('lista mis reportes de Gabinete con su estado y marca los que tienen novedades', () => {
    const { el } = render();
    expect(el.textContent).toContain('No guarda la cita');
    expect(el.textContent).toContain('Abierto');
    expect(el.textContent).toContain('Resuelto');
    expect(el.querySelectorAll('.unread').length).toBe(1);
  });

  it('sin reportes lo dice y ofrece reportar', () => {
    tickets.mine.and.returnValue(of([]));
    const { el } = render();
    expect(el.textContent).toContain('Aún no has reportado nada');
    expect(button(el, 'Reportar un problema')).toBeDefined();
  });

  it('reportar manda lo escrito con la pantalla actual y vuelve a la lista', () => {
    const { fixture, el } = render();
    button(el, 'Reportar un problema')!.click();
    fixture.detectChanges();
    type(el, 'input[name="title"]', 'No guarda');
    type(el, 'textarea[name="description"]', 'Al guardar la cita sale error');
    fixture.detectChanges();
    button(el, 'Enviar reporte')!.click();
    fixture.detectChanges();
    expect(tickets.create).toHaveBeenCalledWith({ type: 'bug', title: 'No guarda', description: 'Al guardar la cita sale error' }, jasmine.any(String));
    expect(tickets.mine).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('Recibimos tu reporte');
  });

  it('no deja enviar un reporte sin título o sin descripción', () => {
    const { fixture, el } = render();
    button(el, 'Reportar un problema')!.click();
    fixture.detectChanges();
    expect(button(el, 'Enviar reporte')!.disabled).toBeTrue();
  });

  it('si el reporte no se pudo enviar, lo dice y conserva lo escrito', () => {
    tickets.create.and.returnValue(throwError(() => new Error('red')));
    const { fixture, el } = render();
    button(el, 'Reportar un problema')!.click();
    fixture.detectChanges();
    type(el, 'input[name="title"]', 'No guarda');
    type(el, 'textarea[name="description"]', 'Sale error');
    fixture.detectChanges();
    button(el, 'Enviar reporte')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No se pudo enviar');
    expect(el.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('No guarda');
  });

  it('el detalle muestra lo reportado y las respuestas de soporte', () => {
    const { fixture, el } = render();
    button(el, 'No guarda la cita')!.click();
    fixture.detectChanges();
    expect(tickets.detail).toHaveBeenCalledWith('t1');
    expect(el.textContent).toContain('Al guardar sale error');
    expect(el.textContent).toContain('Ya lo estamos revisando');
    expect(el.textContent).toContain('Soporte');
  });

  it('en el detalle se puede añadir información y cerrar', () => {
    const { fixture, el } = render();
    button(el, 'No guarda la cita')!.click();
    fixture.detectChanges();
    type(el, 'textarea[name="info"]', 'Pasó otra vez');
    fixture.detectChanges();
    button(el, 'Añadir')!.click();
    expect(tickets.addInfo).toHaveBeenCalledWith('t1', 'Pasó otra vez');
    fixture.detectChanges();
    button(el, 'Cerrar reporte')!.click();
    expect(tickets.close).toHaveBeenCalledWith('t1');
  });

  it('un reporte cerrado no ofrece añadir información ni cerrar', () => {
    tickets.detail.and.returnValue(of(detail({ status: 'closed', canAddInfo: false, canClose: false })));
    const { fixture, el } = render();
    button(el, 'No guarda la cita')!.click();
    fixture.detectChanges();
    expect(el.querySelector('textarea[name="info"]')).toBeNull();
    expect(button(el, 'Cerrar reporte')).toBeUndefined();
  });
});
