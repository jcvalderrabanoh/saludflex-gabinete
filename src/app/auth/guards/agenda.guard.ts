import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AgendaApiService } from '../../core/services/agenda-api.service';

/** La agenda solo se abre en las cuentas que la tienen encendida en jc-core; las demás regresan a «Hoy». */
export function agendaRouteGuard(): CanActivateFn {
  return () => {
    const router = inject(Router);
    return inject(AgendaApiService)
      .enabled()
      .pipe(map((enabled) => enabled || router.createUrlTree(['/operacion/hoy'])));
  };
}
