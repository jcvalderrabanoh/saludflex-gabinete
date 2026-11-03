import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FacilityAction, PermissionsService } from '../../core/services/permissions.service';

/** Sin el permiso, la pantalla no se abre y regresa a «Hoy» (el backend igual respondería 403). */
export function permissionGuard(action: FacilityAction): CanActivateFn {
  return () => inject(PermissionsService).can(action) || inject(Router).createUrlTree(['/operacion/hoy']);
}
