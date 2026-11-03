import { TeamMember, TeamMemberStatus, TeamPreset } from '../../core/models/facility.models';
import { RECORD_ALL, RECORD_ASSIGNED } from '../../core/services/permissions.service';

export interface PresetOption {
  value: TeamPreset;
  label: string;
  /** Lo que deja hacer, dicho como lo diría el dueño del gabinete. */
  explanation: string;
}

/** Preajustes al invitar. «Administrar» y «Carpeta de inspección» no se conceden desde aquí. */
export const PRESETS: readonly PresetOption[] = [
  {
    value: 'coordinador',
    label: 'Coordinador',
    explanation: 'Ve todo el avance y registra evidencia en cualquier obligación.',
  },
  {
    value: 'responsable',
    label: 'Responsable',
    explanation: 'Ve todo el avance y registra evidencia solo en las obligaciones que le asignes.',
  },
  {
    value: 'consulta',
    label: 'Consulta',
    explanation: 'Solo ve el avance; no registra ni cambia nada.',
  },
];

export const STATUS_LABELS: Record<TeamMemberStatus, string> = {
  active: 'Activo',
  invited: 'Invitación pendiente',
  inactive: 'Sin acceso al gabinete',
};

/** El preset que corresponde a sus permisos (`null` si no encaja, p. ej. quien administra). */
export function presetOf(permissions: readonly string[]): TeamPreset | null {
  if (permissions.includes(RECORD_ALL)) return 'coordinador';
  if (permissions.includes(RECORD_ASSIGNED)) return 'responsable';
  if (permissions.includes('facility.read')) return 'consulta';
  return null;
}

export function presetLabel(permissions: readonly string[]): string {
  const preset = presetOf(permissions);
  return PRESETS.find((p) => p.value === preset)?.label ?? 'Sin acceso';
}

/** Igual que el backend: no se opera sobre quien administra ni sobre uno mismo. */
export function canOperate(member: TeamMember, currentUserId: string | null): boolean {
  return !member.isManager && member.id !== currentUserId;
}

/**
 * Sin ningún `facility.*` (p. ej. alguien de la cuenta que solo usa lumen-view):
 * se le puede dar acceso con un preajuste. Si conserva permisos y aun así está
 * «Sin acceso», su cuenta está desactivada y eso no se arregla desde aquí.
 */
export function canGrantAccess(member: TeamMember): boolean {
  return member.status === 'inactive' && member.permissions.length === 0;
}
