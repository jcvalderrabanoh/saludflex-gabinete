import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EvaluatedObligation } from '../models/facility.models';
import { AuthService } from './auth.service';

/** Lo que una pantalla puede ofrecer; cada acción se traduce a permisos `facility.*`. */
export type FacilityAction = 'read' | 'record' | 'schedule' | 'manage' | 'inspect' | 'payments' | 'agenda' | 'agendaManage' | 'agendaConfigure';

export const RECORD_ALL = 'facility.record';
export const RECORD_ASSIGNED = 'facility.record.assigned';

/** Agenda de estudios: permisos propios, que no se conceden al contratar Gabinete. */
export const AGENDA_READ = 'facility.schedule.read';
export const AGENDA_MANAGE = 'facility.schedule.manage';
export const AGENDA_CONFIGURE = 'facility.schedule.configure';

const REQUIRED: Record<FacilityAction, readonly string[]> = {
  read: ['facility.read'],
  record: [RECORD_ALL, RECORD_ASSIGNED],
  // Citas del calendario: jc-core exige el permiso global de captura.
  schedule: [RECORD_ALL],
  manage: ['facility.manage'],
  inspect: ['facility.inspect'],
  // Montos: jc-core no los abre con facility.read ni con la captura acotada.
  payments: [RECORD_ALL, 'facility.manage'],
  // Ver la agenda: jc-core la abre con cualquiera de sus tres permisos.
  agenda: [AGENDA_READ, AGENDA_MANAGE, AGENDA_CONFIGURE],
  agendaManage: [AGENDA_MANAGE],
  agendaConfigure: [AGENDA_CONFIGURE],
};

/** ¿Alguno de los permisos deja hacer la acción? (para registrar basta el global o el asignado). */
export function can(permissions: readonly string[] | undefined, action: FacilityAction): boolean {
  const granted = permissions ?? [];
  return REQUIRED[action].some((p) => granted.includes(p));
}

/** Registrar en esta obligación: global en cualquiera; asignado solo si es responsable. Gana el global. */
export function canRecordObligation(
  permissions: readonly string[] | undefined,
  userId: string | null | undefined,
  obligation: Pick<EvaluatedObligation, 'responsibleUserIds'>,
): boolean {
  const granted = permissions ?? [];
  if (granted.includes(RECORD_ALL)) return true;
  return !!userId && granted.includes(RECORD_ASSIGNED) && obligation.responsibleUserIds.includes(userId);
}

/**
 * Único lugar donde la UI decide qué acciones mostrar. El backend sigue
 * validando: esto solo evita ofrecer botones que fallarían con 403.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly auth = inject(AuthService);
  private readonly user = toSignal(this.auth.currentUser$, { initialValue: this.auth.getCurrentUser() });
  private readonly permissions = computed(() => this.user()?.permissions ?? []);
  readonly userId = computed(() => this.user()?.id ?? null);

  can(action: FacilityAction): boolean {
    return can(this.permissions(), action);
  }

  canRecord(obligation: Pick<EvaluatedObligation, 'responsibleUserIds'>): boolean {
    return canRecordObligation(this.permissions(), this.userId(), obligation);
  }
}
