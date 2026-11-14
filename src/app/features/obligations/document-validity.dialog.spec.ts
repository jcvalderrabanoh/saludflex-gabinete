import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { EvaluatedObligation } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { DocumentValidityDialogComponent, initialValidity, validityError, validityPayload } from './document-validity.dialog';

const obligation = (extra: Partial<EvaluatedObligation> = {}) =>
  ({ id: 'o1', title: 'Permiso del responsable', subjectLabel: 'Dr. Ruiz', kind: 'document', period: null, noExpiry: false, ...extra }) as EvaluatedObligation;

describe('initialValidity', () => {
  it('sin ajuste: la fecha del documento', () => {
    expect(initialValidity(obligation())).toEqual({ mode: 'document', months: null });
  });

  it('con vigencia en meses: arranca en meses', () => {
    expect(initialValidity(obligation({ period: { unit: 'month', every: 24 } }))).toEqual({ mode: 'months', months: 24 });
  });

  it('confirmado sin vencimiento: no vence', () => {
    expect(initialValidity(obligation({ noExpiry: true }))).toEqual({ mode: 'none', months: null });
  });
});

describe('validityError', () => {
  it('pide meses enteros entre 1 y 120', () => {
    expect(validityError({ mode: 'months', months: null })).toBe('Indica cuántos meses dura.');
    expect(validityError({ mode: 'months', months: 0 })).toBe('Indica cuántos meses dura.');
    expect(validityError({ mode: 'months', months: 121 })).toBe('La vigencia va de 1 a 120 meses.');
    expect(validityError({ mode: 'months', months: 1.5 })).toBe('La vigencia va de 1 a 120 meses.');
    expect(validityError({ mode: 'months', months: 24 })).toBeNull();
  });

  it('las otras opciones no piden nada', () => {
    expect(validityError({ mode: 'document', months: null })).toBeNull();
    expect(validityError({ mode: 'none', months: null })).toBeNull();
  });
});

describe('validityPayload', () => {
  it('fecha del documento: quita vigencia y «no vence»', () => {
    expect(validityPayload({ mode: 'document', months: 5 })).toEqual({ periodUnit: null, periodEvery: null, noExpiry: false });
  });

  it('meses: vigencia desde la expedición', () => {
    expect(validityPayload({ mode: 'months', months: 24 })).toEqual({ periodUnit: 'month', periodEvery: 24, noExpiry: false });
  });

  it('no vence: solo la confirmación (el backend quita la vigencia)', () => {
    expect(validityPayload({ mode: 'none', months: null })).toEqual({ noExpiry: true });
  });
});

describe('DocumentValidityDialogComponent', () => {
  let api: jasmine.SpyObj<FacilityApiService>;
  let ref: jasmine.SpyObj<MatDialogRef<DocumentValidityDialogComponent>>;

  function create(o = obligation()) {
    api = jasmine.createSpyObj<FacilityApiService>('FacilityApiService', ['setDocumentValidity']);
    ref = jasmine.createSpyObj<MatDialogRef<DocumentValidityDialogComponent>>('MatDialogRef', ['close']);
    TestBed.configureTestingModule({
      imports: [DocumentValidityDialogComponent],
      providers: [
        { provide: FacilityApiService, useValue: api },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { obligation: o } },
      ],
    });
    const fixture = TestBed.createComponent(DocumentValidityDialogComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('guarda la vigencia en meses y cierra', () => {
    const c = create();
    api.setDocumentValidity.and.returnValue(of({}));
    c.mode.set('months');
    c.months.set(24);
    c.save();
    expect(api.setDocumentValidity).toHaveBeenCalledWith('o1', { periodUnit: 'month', periodEvery: 24, noExpiry: false });
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('no manda nada si faltan los meses', () => {
    const c = create();
    c.mode.set('months');
    c.save();
    expect(api.setDocumentValidity).not.toHaveBeenCalled();
    expect(c.error()).toBe('Indica cuántos meses dura.');
  });

  it('muestra el error de la API y deja reintentar', () => {
    const c = create();
    api.setDocumentValidity.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Indica la vigencia o que no vence, no las dos' } })),
    );
    c.mode.set('none');
    c.save();
    expect(c.error()).toBe('Indica la vigencia o que no vence, no las dos');
    expect(c.saving()).toBeFalse();
    expect(ref.close).not.toHaveBeenCalled();
  });
});
