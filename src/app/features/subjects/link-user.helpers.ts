import { LinkableUser, StaffRole } from '../../core/models/facility.models';

/** Rol de lumen-view que corresponde a quien firma informes. */
const INTERPRETER_ROLE = 'interpreter';
const RADIOLOGIST: StaffRole = 'medico-radiologo';

export interface PersonFields {
  fullName: string;
  role: StaffRole;
  professionalLicense: string;
}

export interface LinkOption {
  user: LinkableUser;
  label: string;
  /** Ya es otra persona de este establecimiento: no se puede elegir. */
  taken: boolean;
}

/**
 * Lo que se llena al elegir un usuario: solo campos vacíos. El rol solo se
 * sugiere al registrar a alguien nuevo que en lumen-view es intérprete.
 */
export function prefillFromUser(user: LinkableUser, current: PersonFields, isNew: boolean): Partial<PersonFields> {
  const patch: Partial<PersonFields> = {};
  if (!current.fullName.trim() && user.fullName) patch.fullName = user.fullName;
  if (isNew && user.role === INTERPRETER_ROLE) patch.role = RADIOLOGIST;
  if (!current.professionalLicense.trim() && user.professionalLicense) {
    patch.professionalLicense = user.professionalLicense;
  }
  return patch;
}

export function linkOptions(users: LinkableUser[], currentPersonId?: string): LinkOption[] {
  return users.map((user) => ({
    user,
    label: user.fullName ? `${user.fullName} · ${user.email}` : user.email,
    taken: user.linkedPersonnelId !== null && user.linkedPersonnelId !== currentPersonId,
  }));
}
