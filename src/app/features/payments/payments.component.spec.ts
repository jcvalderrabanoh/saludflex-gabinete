import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { PaymentsComponent } from './payments.component';

const API = 'http://localhost:3000/facility';

const meter = (id: string, name: string, reference: string | null, over: object = {}) => ({
  id, establishmentId: 'e1', name, kind: 'service', category: 'utilities', amountMode: 'variable', amountCents: null,
  periodMonths: 2, firstDueOn: '2026-09-20', endsOn: null, reference, overdue: [], next: '2026-11-20', skipped: [], paid: [], lastPaid: null,
  unpaidAttachments: [], ...over,
});

function setup(permissions: string[] = ['facility.record']) {
  TestBed.configureTestingModule({
    imports: [PaymentsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      { provide: EstablishmentContextService, useValue: { current: signal({ id: 'e1', name: 'UDIX Matriz' }) } },
      { provide: PermissionsService, useValue: { can: (a: string) => a !== 'manage' || permissions.includes('facility.manage') } },
    ],
  });
  const fixture = TestBed.createComponent(PaymentsComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('Pagos recurrentes', () => {
  it('muestra dónde subir recibos y distingue dos medidores de luz por su número', () => {
    const { fixture, http, el } = setup();
    http.expectOne(`${API}/establishments/e1/recurring-payments`).flush({
      today: '2026-11-08',
      payments: [
        meter('p1', 'Luz · Planta baja', '123456789012'),
        meter('p2', 'Luz · Primer piso', '987654321098', {
          unpaidAttachments: [{ id: 'f1', contentType: 'application/pdf', references: ['F-1'], createdAt: '', dueOn: '2026-11-20' }],
        }),
      ],
    });
    http.expectOne(`${API}/establishments/e1/payment-attachments/pending`).flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Subir recibos o comprobantes');
    expect(el.textContent).toContain('Servicio o medidor 123456789012');
    expect(el.textContent).toContain('Servicio o medidor 987654321098');
    const upper = [...el.querySelectorAll('.line')].find((l) => l.textContent?.includes('Primer piso'));
    expect(upper?.textContent).toContain('Recibo de este periodo:');
    expect(upper?.textContent).toContain('Ver F-1');
  });

  it('un recibo leído dice de qué medidor es', () => {
    const { fixture, http, el } = setup();
    http.expectOne(`${API}/establishments/e1/recurring-payments`).flush({ today: '2026-11-08', payments: [meter('p2', 'Luz · Primer piso', '987654321098')] });
    http.expectOne(`${API}/establishments/e1/payment-attachments/pending`).flush([
      {
        id: 'a1', establishmentId: 'e1', state: 'review', expenseId: null, recurringPaymentId: null, dueOn: null, contentType: 'application/pdf',
        references: [], lastError: null, hasFile: true, createdAt: '',
        suggestion: { documentType: 'Recibo CFE', isPaymentDocument: true, name: 'Luz', category: 'utilities', categoryConfidence: 1, amountCents: 215000, currency: 'MXN', amountConfidence: 1, paidOn: null, paidOnConfidence: 0, dueOn: '2026-11-18', supplierName: 'CFE', supplierConfidence: 1, supplierId: null, references: [], suggestedTarget: { recurringPaymentId: 'p2', dueOn: '2026-11-20' } },
        possibleDuplicates: [],
      },
    ]);
    fixture.detectChanges();
    expect(el.querySelector('.pending')?.textContent).toContain('es de Luz · Primer piso · servicio 987654321098 (periodo 2026-11-20)');
  });
});
