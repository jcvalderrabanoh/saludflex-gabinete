import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { ExportListsButtonComponent, exportErrorMessage, exportFileName } from './export-lists-button.component';

describe('exportFileName', () => {
  it('Excel lleva .xlsx y CSV un .zip (un CSV por listado), con la fecha local', () => {
    const date = new Date(2026, 10, 2, 23, 30); // 2-nov local, aunque en UTC ya sea 3-nov
    expect(exportFileName('xlsx', date)).toBe('operacion-listados-2026-11-02.xlsx');
    expect(exportFileName('csv', date)).toBe('operacion-listados-2026-11-02.zip');
  });
});

describe('exportErrorMessage', () => {
  it('sin permiso dice qué falta', () => {
    expect(exportErrorMessage(new HttpErrorResponse({ status: 403 }))).toBe(
      'No tienes permiso para descargar los listados. Pídeselo a quien administra tu cuenta.',
    );
  });

  it('cualquier otro error invita a reintentar', () => {
    expect(exportErrorMessage(new HttpErrorResponse({ status: 503 }))).toBe(
      'No pudimos preparar la descarga. Inténtalo de nuevo en unos minutos.',
    );
  });
});

describe('ExportListsButtonComponent', () => {
  const api = jasmine.createSpyObj<FacilityApiService>('FacilityApiService', ['exportLists']);
  const snack = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
  const current = signal<{ id: string } | null>({ id: 'e1' });

  beforeEach(() => {
    api.exportLists.calls.reset();
    snack.open.calls.reset();
    TestBed.configureTestingModule({
      imports: [ExportListsButtonComponent],
      providers: [
        { provide: FacilityApiService, useValue: api },
        { provide: MatSnackBar, useValue: snack },
        { provide: EstablishmentContextService, useValue: { current } },
      ],
    });
  });

  it('descarga los listados del establecimiento en el formato elegido', () => {
    api.exportLists.and.returnValue(of(new Blob(['PK'])));
    const component = TestBed.createComponent(ExportListsButtonComponent).componentInstance;
    const click = spyOn(HTMLAnchorElement.prototype, 'click');

    component.download('csv');

    expect(api.exportLists).toHaveBeenCalledWith('e1', 'csv');
    expect(click).toHaveBeenCalled();
    expect(component.downloading()).toBeNull();
  });

  it('si falla, avisa con un mensaje y libera el botón', () => {
    api.exportLists.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const component = TestBed.createComponent(ExportListsButtonComponent).componentInstance;

    component.download('xlsx');

    expect(snack.open).toHaveBeenCalledWith(exportErrorMessage(new HttpErrorResponse({ status: 403 })), 'OK', {
      duration: 6000,
    });
    expect(component.downloading()).toBeNull();
  });

  it('sin establecimiento elegido no pide nada', () => {
    current.set(null);
    const component = TestBed.createComponent(ExportListsButtonComponent).componentInstance;
    component.download('xlsx');
    expect(api.exportLists).not.toHaveBeenCalled();
    current.set({ id: 'e1' });
  });
});
