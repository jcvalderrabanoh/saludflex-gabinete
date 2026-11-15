import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { EquipmentIncident, IncidentResult } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { CloseIncidentData, CloseIncidentDialogComponent } from './close-incident.dialog';

const INCIDENT = { id: 'inc1', reportedOn: '2026-11-10', description: 'No enciende', impact: 'down', state: 'open' } as EquipmentIncident;
const RESULT = { incident: { ...INCIDENT, state: 'closed' }, operationalStatus: 'operating', qualityChecks: [], sealed: true, replayed: false } as unknown as IncidentResult;

function setup(response = of(RESULT)) {
  const api = { closeIncident: jasmine.createSpy('closeIncident').and.returnValue(response) };
  const ref = { close: jasmine.createSpy('close') };
  const data: CloseIncidentData = { incident: INCIDENT, today: '2026-11-15' };
  TestBed.configureTestingModule({
    imports: [CloseIncidentDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: FacilityApiService, useValue: api },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  });
  const fixture = TestBed.createComponent(CloseIncidentDialogComponent);
  fixture.detectChanges();
  return { component: fixture.componentInstance, api, ref, fixture, element: fixture.nativeElement as HTMLElement };
}

describe('CloseIncidentDialogComponent', () => {
  it('muestra la falla que se cierra y propone la fecha de hoy', () => {
    const { component, element } = setup();

    expect(element.textContent).toContain('No enciende');
    expect(element.textContent).toContain('Cerrar reparación');
    expect(component.form.controls.closedOn.value).toBe('2026-11-15');
  });

  it('pide qué se hizo', () => {
    const { component, api } = setup();

    component.save();

    expect(api.closeIncident).not.toHaveBeenCalled();
  });

  it('no acepta cerrar antes del reporte ni en el futuro', () => {
    const { component } = setup();
    component.form.patchValue({ closedOn: '2026-11-09', resolution: 'Cambio de tubo' });
    expect(component.form.hasError('beforeReport')).toBeTrue();

    component.form.patchValue({ closedOn: '2026-11-16' });
    expect(component.form.hasError('future')).toBeTrue();
  });

  it('cierra con su llave y devuelve el resultado', () => {
    const { component, api, ref } = setup();
    component.form.patchValue({ resolution: ' Cambio de tubo ', performedBy: ' Servicios del Norte ' });

    component.save();

    const [id, input, key] = api.closeIncident.calls.mostRecent().args;
    expect(id).toBe('inc1');
    expect(input).toEqual({ closedOn: '2026-11-15', resolution: 'Cambio de tubo', performedBy: 'Servicios del Norte' });
    expect(key).toEqual(jasmine.any(String));
    expect(ref.close).toHaveBeenCalledWith(RESULT);
  });

  it('si ya estaba cerrado (409) lo dice', () => {
    const error = new HttpErrorResponse({ status: 409, error: { message: 'El correctivo ya está cerrado' } });
    const { component, fixture, element } = setup(throwError(() => error));
    component.form.patchValue({ resolution: 'Cambio de tubo' });

    component.save();
    fixture.detectChanges();

    expect(element.textContent).toContain('El correctivo ya está cerrado');
  });
});
