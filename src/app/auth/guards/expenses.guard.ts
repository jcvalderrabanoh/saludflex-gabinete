import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { FacilityApiService } from '../../core/services/facility-api.service';

/**
 * Gastos reemplaza a Pagos recurrentes solo en las cuentas encendidas en
 * jc-core: cada ruta se abre en su estado y manda a la otra si no le toca.
 */
export function expensesRouteGuard(whenEnabled: boolean, fallback: string): CanActivateFn {
  return () => {
    const router = inject(Router);
    return inject(FacilityApiService)
      .expensesEnabled()
      .pipe(map((enabled) => enabled === whenEnabled || router.createUrlTree([fallback])));
  };
}
