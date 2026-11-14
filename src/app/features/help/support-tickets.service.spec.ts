import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SupportTicketsService } from './support-tickets.service';

const BASE = 'http://localhost:3000/facility/support/tickets';

describe('SupportTicketsService', () => {
  let tickets: SupportTicketsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    tickets = TestBed.inject(SupportTicketsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('todo va a las rutas de Gabinete, nunca a las de lumen-view', () => {
    tickets.mine().subscribe();
    tickets.unreadCount().subscribe();
    tickets.detail('t1').subscribe();
    http.expectOne(`${BASE}/mine`).flush([]);
    http.expectOne(`${BASE}/unread-count`).flush({ count: 0 });
    http.expectOne(`${BASE}/t1`).flush({});
    http.expectNone('http://localhost:3000/support/tickets/mine');
  });

  it('reportar manda tipo, título y descripción, más la pantalla donde estaba como contexto', () => {
    tickets.create({ type: 'bug', title: ' No guarda ', description: ' Sale error ' }, '/operacion/agenda').subscribe();
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'bug', title: 'No guarda', description: 'Sale error', context: 'Gabinete · /operacion/agenda' });
    req.flush({ success: true, ticketId: 't1', ticketUrl: null, error: null });
  });

  it('añadir información y cerrar usan las rutas del reporte', () => {
    tickets.addInfo('t1', ' Pasó otra vez ').subscribe();
    const add = http.expectOne(`${BASE}/t1/messages`);
    expect(add.request.body).toEqual({ body: 'Pasó otra vez' });
    add.flush({});
    tickets.close('t1').subscribe();
    http.expectOne({ method: 'POST', url: `${BASE}/t1/close` }).flush({});
  });

  it('si el conteo de novedades falla, cuenta cero en vez de romper la barra', () => {
    let count = -1;
    tickets.unreadCount().subscribe((c) => (count = c));
    http.expectOne(`${BASE}/unread-count`).flush({}, { status: 500, statusText: 'Error' });
    expect(count).toBe(0);
  });
});
