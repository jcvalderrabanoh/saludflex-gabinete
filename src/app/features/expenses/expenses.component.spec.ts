import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CommitmentPlan } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { ExpensesComponent } from './expenses.component';

const API = 'http://localhost:3000/facility';

const PLAN: CommitmentPlan = {
  today: '2026-11-08',
  until: '2026-12-08',
  items: [
    { source: 'recurring', sourceId: 'p1', name: 'Luz CFE', category: 'utilities', dueOn: '2026-10-28', overdue: true, amountCents: 342000, certainty: 'estimated' },
    { source: 'expense', sourceId: 'x1', name: 'Gel y papel', category: 'supplies', dueOn: '2026-11-18', overdue: false, amountCents: 234000, certainty: 'known' },
    { source: 'recurring', sourceId: 'p2', name: 'Gas LP', category: 'utilities', dueOn: '2026-11-25', overdue: false, amountCents: null, certainty: 'unknown' },
  ],
  days: [],
  totals: { totalCents: 576000, estimatedCents: 342000, overdueCents: 342000, unknownCount: 1 },
};

const payment = (id: string, name: string, over: object = {}) => ({
  id, establishmentId: 'e1', name, kind: 'service', category: 'utilities', amountMode: 'variable', amountCents: null,
  periodMonths: 2, firstDueOn: '2026-08-28', endsOn: null, overdue: [], next: '2026-12-28', skipped: [], paid: [], lastPaid: null, ...over,
});

const EXPENSE = { id: 'x1', establishmentId: 'e1', name: 'Gel y papel', category: 'supplies', amountCents: 234000, dueOn: '2026-11-18', paidOn: null };

function setup(permissions: string[] = ['facility.manage']) {
  const current = signal({ id: 'e1', name: 'UDIX Matriz' });
  TestBed.configureTestingModule({
    imports: [ExpensesComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      { provide: EstablishmentContextService, useValue: { current } },
      { provide: PermissionsService, useValue: { can: (a: string) => a !== 'manage' || permissions.includes('facility.manage') } },
    ],
  });
  const fixture = TestBed.createComponent(ExpensesComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, http, current, el: fixture.nativeElement as HTMLElement };
}

/** Soportes por validar y proveedores: se piden junto con lo demás. */
function flushExtras(http: HttpTestingController, pending: object[] = []) {
  http.expectOne(`${API}/establishments/e1/payment-attachments/pending`).flush(pending);
  http.expectOne(`${API}/establishments/e1/payment-suppliers`).flush([]);
}

function flushAll(http: HttpTestingController, plan: CommitmentPlan = PLAN, expenses: object[] = [EXPENSE], pending: object[] = []) {
  http.expectOne(`${API}/establishments/e1/commitments`).flush(plan);
  http.expectOne(`${API}/establishments/e1/recurring-payments`).flush({ today: plan.today, payments: [payment('p1', 'Luz CFE'), payment('p2', 'Gas LP')] });
  http.expectOne((r) => r.url === `${API}/establishments/e1/expenses`).flush({ today: plan.today, expenses });
  flushExtras(http, pending);
}

describe('Gastos', () => {
  it('lo primero que dice es cuánto se necesita, con lo estimado y lo sin dato explícitos', () => {
    const { fixture, http, el } = setup();
    flushAll(http);
    fixture.detectChanges();
    const summary = el.querySelector('.summary');
    expect(summary?.textContent).toContain('Cuánto necesitas en los próximos 30 días');
    expect(summary?.textContent).toContain('$5,760 MXN');
    expect(summary?.textContent).toContain('Incluye $3,420 MXN estimados y 1 concepto sin dato, que no suma.');
  });

  it('un concepto sin dato dice «Sin dato», nunca $0', () => {
    const { fixture, http, el } = setup();
    flushAll(http);
    fixture.detectChanges();
    const gas = [...el.querySelectorAll('.line')].find((l) => l.textContent?.includes('Gas LP'));
    expect(gas?.textContent).toContain('Sin dato');
    expect(gas?.textContent).not.toContain('$0');
  });

  it('marca el estado con texto, y la leyenda aclara que no es contabilidad', () => {
    const { fixture, http, el } = setup();
    flushAll(http);
    fixture.detectChanges();
    expect(el.textContent).toContain('Vencido');
    expect(el.textContent).toContain('Por pagar');
    expect(el.textContent).toContain('Registro interno; no es contabilidad ni comprobante fiscal');
  });

  it('un gasto único se marca como pagado con un clic y recarga', () => {
    const { fixture, http, el } = setup();
    flushAll(http);
    fixture.detectChanges();
    const line = [...el.querySelectorAll('.line')].find((l) => l.textContent?.includes('Gel y papel'));
    line?.querySelector<HTMLButtonElement>('button.pay')?.click();
    const req = http.expectOne(`${API}/expenses/x1/paid`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
    flushAll(http);
  });

  it('deshacer un pago apunta al periodo del calendario, no al día en que se pagó', () => {
    const { fixture, http, el } = setup();
    http.expectOne(`${API}/establishments/e1/commitments`).flush(PLAN);
    http.expectOne(`${API}/establishments/e1/recurring-payments`).flush({
      today: PLAN.today,
      payments: [payment('p3', 'Renta', { paid: [{ dueOn: '2026-11-01', paidOn: '2026-11-03', paidCents: 100 }] })],
    });
    http.expectOne((r) => r.url === `${API}/establishments/e1/expenses`).flush({ today: PLAN.today, expenses: [] });
    flushExtras(http);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button.undo')?.click();
    const req = http.expectOne(`${API}/recurring-payments/p3/paid/2026-11-01`);
    expect(req.request.method).toBe('DELETE');
  });

  it('quien no administra no ve «Agregar gasto» pero sí puede marcar', () => {
    const { fixture, http, el } = setup(['facility.record']);
    flushAll(http);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Agregar gasto');
    expect(el.querySelector('button.pay')).not.toBeNull();
  });

  it('sin nada capturado invita a agregar, sin ceros', () => {
    const { fixture, http, el } = setup();
    http.expectOne(`${API}/establishments/e1/commitments`).flush({ ...PLAN, items: [], totals: { totalCents: 0, estimatedCents: 0, overdueCents: 0, unknownCount: 0 } });
    http.expectOne(`${API}/establishments/e1/recurring-payments`).flush({ today: PLAN.today, payments: [] });
    http.expectOne((r) => r.url === `${API}/establishments/e1/expenses`).flush({ today: PLAN.today, expenses: [] });
    flushExtras(http);
    fixture.detectChanges();
    expect(el.querySelector('.empty')?.textContent).toContain('Agrega tu primer gasto');
    expect(el.querySelector('.summary')).toBeNull();
  });

  it('un corte que solo tiene conceptos sin dato no dice «Nada en este corte»', () => {
    const { fixture, http, el } = setup();
    const onlyUnknown = { ...PLAN, items: [PLAN.items[2]], totals: { totalCents: 0, estimatedCents: 0, overdueCents: 0, unknownCount: 1 } };
    flushAll(http, onlyUnknown);
    fixture.detectChanges();
    const cut = [...el.querySelectorAll('.cut')].find((c) => c.textContent?.includes('1 sin dato'));
    expect(cut?.textContent).not.toContain('Nada en este corte');
  });

  it('al cambiar de establecimiento cancela la carga anterior', () => {
    const { fixture, http, current } = setup();
    const first = http.expectOne(`${API}/establishments/e1/commitments`);
    current.set({ id: 'e2', name: 'Sucursal' });
    fixture.detectChanges();
    expect(first.cancelled).toBeTrue();
    http.expectOne(`${API}/establishments/e2/commitments`);
  });

  it('un error dice qué pasó', () => {
    const { fixture, http, el } = setup();
    http.expectOne(`${API}/establishments/e1/commitments`).flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('No pudimos cargar tus gastos');
  });

  it('lista los soportes por validar con lo que propuso la IA y avisa del posible duplicado', () => {
    const { fixture, http, el } = setup();
    flushAll(http, PLAN, [EXPENSE], [
      {
        id: 'a1', establishmentId: 'e1', state: 'review', expenseId: null, recurringPaymentId: null, dueOn: null,
        contentType: 'application/pdf', references: ['F-1'], lastError: null, hasFile: true, createdAt: '2026-11-08T10:00:00Z',
        suggestion: { documentType: 'Factura', isPaymentDocument: true, name: 'Gel y papel', category: 'supplies', categoryConfidence: 0.9, amountCents: 234000, currency: 'MXN', amountConfidence: 0.9, paidOn: '2026-11-07', paidOnConfidence: 0.9, dueOn: null, supplierName: 'Distribuidora', supplierConfidence: 0.9, supplierId: null, references: ['F-1'] },
        possibleDuplicates: [{ expenseId: 'x1' }],
      },
    ]);
    fixture.detectChanges();
    const pending = el.querySelector('.pending');
    expect(pending?.textContent).toContain('Soportes por validar');
    expect(pending?.textContent).toContain('Gel y papel · $2,340 MXN · pagado el 2026-11-07 · Distribuidora');
    expect(pending?.textContent).toContain('posible duplicado');
    expect(pending?.querySelector('button')).not.toBeNull();
  });

  it('un gasto con soportes y posible duplicado lo muestra en su renglón', () => {
    const { fixture, http, el } = setup();
    const withExtras = { ...EXPENSE, attachments: [{ id: 'f1', contentType: 'application/pdf', references: ['F-9'], createdAt: '2026-11-08' }], possibleDuplicateIds: ['x2'] };
    flushAll(http, PLAN, [withExtras]);
    fixture.detectChanges();
    const line = [...el.querySelectorAll('.line')].find((l) => l.textContent?.includes('Gel y papel'));
    expect(line?.querySelector('.tag')?.textContent).toContain('1');
    expect(line?.textContent).toContain('¿Duplicado? Unir');
  });

  it('quien no administra no ve «Unir» en un posible duplicado', () => {
    const { fixture, http, el } = setup(['facility.record']);
    flushAll(http, PLAN, [{ ...EXPENSE, possibleDuplicateIds: ['x2'] }]);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('¿Duplicado? Unir');
  });
});
