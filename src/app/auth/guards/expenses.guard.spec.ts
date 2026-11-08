import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { expensesRouteGuard } from './expenses.guard';

function run(enabled: boolean, whenEnabled: boolean, fallback: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: FacilityApiService, useValue: { expensesEnabled: () => of(enabled) } }],
  });
  const result = TestBed.runInInjectionContext(() => expensesRouteGuard(whenEnabled, fallback)({} as never, {} as never));
  return firstValueFrom(result as Observable<boolean | UrlTree>);
}

describe('expensesRouteGuard', () => {
  it('abre Gastos en una cuenta encendida', async () => {
    expect(await run(true, true, '/operacion/pagos')).toBeTrue();
  });

  it('una cuenta apagada no ve Gastos: regresa a Pagos recurrentes', async () => {
    const result = await run(false, true, '/operacion/pagos');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/operacion/pagos');
  });

  it('una cuenta encendida que entra a Pagos llega a Gastos', async () => {
    const result = await run(true, false, '/operacion/gastos');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/operacion/gastos');
  });
});
