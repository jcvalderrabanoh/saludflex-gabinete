import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { EvaluatedObligation } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PaymentWindowDialogComponent, windowFormError } from './payment-window.dialog';

describe('windowFormError', () => {
  it('sin error con A y B, o con A igual a B', () => {
    expect(windowFormError('2027-01-01', '2027-03-31')).toBeNull();
    expect(windowFormError('2027-01-15', '2027-01-15')).toBeNull();
  });

  it('pide las dos fechas', () => {
    expect(windowFormError('', '2027-03-31')).toBe('Elige la fecha desde la que se puede pagar.');
    expect(windowFormError('2027-01-01', '')).toBe('Elige el último día para pagar.');
  });

  it('B no puede ser antes que A', () => {
    expect(windowFormError('2027-03-31', '2027-01-01')).toBe('El último día no puede ser antes del primero.');
  });
});

describe('PaymentWindowDialogComponent', () => {
  let api: jasmine.SpyObj<FacilityApiService>;
  let ref: jasmine.SpyObj<MatDialogRef<PaymentWindowDialogComponent>>;

  function create(window: EvaluatedObligation['window'] = null) {
    api = jasmine.createSpyObj<FacilityApiService>('FacilityApiService', ['setPaymentWindow']);
    ref = jasmine.createSpyObj<MatDialogRef<PaymentWindowDialogComponent>>('MatDialogRef', ['close']);
    const obligation = { id: 'o1', title: 'Refrendo', subjectLabel: null, window } as EvaluatedObligation;
    TestBed.configureTestingModule({
      imports: [PaymentWindowDialogComponent],
      providers: [
        { provide: FacilityApiService, useValue: api },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { obligation } },
      ],
    });
    const fixture = TestBed.createComponent(PaymentWindowDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('arranca con el plazo actual', () => {
    const c = create({ startsOn: '2027-01-01', endsOn: '2027-03-31', paid: false }).componentInstance;
    expect(c.startsOn()).toBe('2027-01-01');
    expect(c.endsOn()).toBe('2027-03-31');
  });

  it('guarda el plazo y cierra', () => {
    const c = create().componentInstance;
    api.setPaymentWindow.and.returnValue(of({}));
    c.startsOn.set('2027-01-01');
    c.endsOn.set('2027-03-31');
    c.save();
    expect(api.setPaymentWindow).toHaveBeenCalledWith('o1', { startsOn: '2027-01-01', endsOn: '2027-03-31' });
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('con un plazo inválido no llama a la API y explica qué falta', () => {
    const c = create().componentInstance;
    c.startsOn.set('2027-03-31');
    c.endsOn.set('2027-01-01');
    c.save();
    expect(api.setPaymentWindow).not.toHaveBeenCalled();
    expect(c.error()).toBe('El último día no puede ser antes del primero.');
  });

  it('quitar el plazo manda null', () => {
    const c = create({ startsOn: '2027-01-01', endsOn: '2027-03-31', paid: false }).componentInstance;
    api.setPaymentWindow.and.returnValue(of({}));
    c.remove();
    expect(api.setPaymentWindow).toHaveBeenCalledWith('o1', null);
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('si la API falla, muestra su mensaje y no cierra', () => {
    const c = create().componentInstance;
    api.setPaymentWindow.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'El plazo no puede terminar antes de empezar' } })),
    );
    c.startsOn.set('2027-01-01');
    c.endsOn.set('2027-03-31');
    c.save();
    expect(c.error()).toBe('El plazo no puede terminar antes de empezar');
    expect(c.saving()).toBeFalse();
    expect(ref.close).not.toHaveBeenCalled();
  });
});
