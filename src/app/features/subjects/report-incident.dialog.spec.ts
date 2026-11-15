import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { IncidentResult } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { ReportIncidentData, ReportIncidentDialogComponent } from './report-incident.dialog';

const RESULT = { incident: { id: 'inc1' }, operationalStatus: 'down', qualityChecks: [], replayed: false } as unknown as IncidentResult;

function setup(response = of(RESULT)) {
  const api = { reportIncident: jasmine.createSpy('reportIncident').and.returnValue(response) };
  const ref = { close: jasmine.createSpy('close') };
  const data: ReportIncidentData = { equipmentId: 'eq1', equipmentName: 'Sala 1', today: '2026-11-15' };
  TestBed.configureTestingModule({
    imports: [ReportIncidentDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: FacilityApiService, useValue: api },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  });
  const fixture = TestBed.createComponent(ReportIncidentDialogComponent);
  fixture.detectChanges();
  return { component: fixture.componentInstance, api, ref, fixture, element: fixture.nativeElement as HTMLElement };
}

describe('ReportIncidentDialogComponent', () => {
  it('ofrece «Restringido» y «Fuera de servicio» y propone la fecha de hoy', () => {
    const { component, element } = setup();

    expect(component.form.controls.reportedOn.value).toBe('2026-11-15');
    expect(element.textContent).toContain('Restringido');
    expect(element.textContent).toContain('Fuera de servicio');
    expect(element.textContent).toContain('Reportar falla');
  });

  it('no deja reportar sin descripción ni efecto', () => {
    const { component, api } = setup();

    component.save();

    expect(component.form.invalid).toBeTrue();
    expect(api.reportIncident).not.toHaveBeenCalled();
  });

  it('no acepta una fecha futura', () => {
    const { component } = setup();
    component.form.patchValue({ reportedOn: '2026-11-16', description: 'No enciende', impact: 'down' });

    expect(component.form.hasError('future')).toBeTrue();
  });

  it('reporta con su llave y devuelve el resultado', () => {
    const { component, api, ref } = setup();
    component.form.patchValue({ description: '  No enciende el tubo  ', impact: 'down' });

    component.save();

    const [id, input, key] = api.reportIncident.calls.mostRecent().args;
    expect(id).toBe('eq1');
    expect(input).toEqual({ reportedOn: '2026-11-15', description: 'No enciende el tubo', impact: 'down' });
    expect(key).toEqual(jasmine.any(String));
    expect(ref.close).toHaveBeenCalledWith(RESULT);
  });

  it('si falla, muestra el motivo y reintenta con la misma llave', () => {
    const error = new HttpErrorResponse({ status: 400, error: { message: 'La fecha no puede ser futura' } });
    const { component, api, fixture, element } = setup(throwError(() => error));
    component.form.patchValue({ description: 'No enciende', impact: 'restricted' });

    component.save();
    fixture.detectChanges();
    component.save();

    expect(element.textContent).toContain('La fecha no puede ser futura');
    const keys = api.reportIncident.calls.all().map((c) => c.args[2]);
    expect(keys[0]).toBe(keys[1]);
  });
});
