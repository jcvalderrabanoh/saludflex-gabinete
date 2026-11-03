import { EstablishmentType, ObligationStatus, ServiceType } from './facility.models';

export const STATUS_LABELS: Record<ObligationStatus, string> = {
  ok: 'Vigente',
  'due-soon': 'Por vencer',
  overdue: 'Vencido',
  missing: 'Falta',
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  xray: 'Rayos X',
  mammography: 'Mastografía',
  ct: 'Tomografía',
  ultrasound: 'Ultrasonido',
  laboratory: 'Laboratorio clínico',
  consultation: 'Consulta',
  hemodialysis: 'Hemodiálisis',
};

export const ESTABLISHMENT_TYPE_LABELS: Record<EstablishmentType, string> = {
  consultorio: 'Consultorio',
  'clinica-consulta-externa': 'Clínica de consulta externa',
  'gabinete-imagen': 'Gabinete de imagen',
  'laboratorio-clinico': 'Laboratorio clínico',
  'unidad-hemodialisis': 'Unidad de hemodiálisis',
};

/** Secciones de la carpeta, en el orden de la visita (igual que el PDF del backend). */
export const FOLDER_SECTIONS: Record<number, string> = {
  2: 'Aviso o licencia sanitaria y responsables',
  3: 'Título y cédula del personal',
  4: 'Seguridad radiológica: documentos',
  5: 'Personal ocupacionalmente expuesto',
  6: 'Equipos: control de calidad y mantenimiento',
  7: 'RPBI',
  9: 'Limpieza y control de infecciones',
  11: 'Privacidad y publicidad',
  12: 'Protección civil y STPS',
};

/** «faltan 3 días», «vence hoy», «venció hace 2 días». */
export function dueLabel(daysLeft: number | null, dueOn: string | null): string {
  if (daysLeft === null || dueOn === null) return dueOn ? `Vence ${dueOn}` : 'Sin vencimiento';
  if (daysLeft < 0) {
    const days = -daysLeft;
    return `Venció hace ${days} ${days === 1 ? 'día' : 'días'} (${dueOn})`;
  }
  if (daysLeft === 0) return `Vence hoy (${dueOn})`;
  return `Faltan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'} (${dueOn})`;
}

export const MODALITY_LABELS: Record<import('./facility.models').EquipmentModality, string> = {
  xray: 'Rayos X',
  mammography: 'Mastografía',
  ct: 'Tomografía',
  ultrasound: 'Ultrasonido',
  other: 'Otro',
};

export const ROLE_LABELS: Record<import('./facility.models').StaffRole, string> = {
  'medico-radiologo': 'Médico radiólogo',
  medico: 'Médico',
  'tecnico-radiologo': 'Técnico radiólogo',
  enfermeria: 'Enfermería',
  'responsable-sanitario': 'Responsable sanitario',
  'responsable-operacion': 'Responsable de la operación (RX)',
  administrativo: 'Administrativo',
};

/**
 * Entidades federativas con el nombre que reconoce el backend
 * (`MexicanStateEnum` de jc-core). El estado decide qué obligaciones estatales
 * y municipales se activan, así que se elige de la lista en vez de escribirse.
 */
export const MEXICAN_STATES: readonly string[] = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Guanajuato',
  'Guerrero', 'Hidalgo', 'Jalisco', 'Estado de México', 'Michoacán', 'Morelos',
  'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo',
  'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala',
  'Veracruz', 'Yucatán', 'Zacatecas',
];

/** Opciones del selector de estado; conserva un valor anterior escrito a mano. */
export function stateOptions(current: string | null | undefined): string[] {
  return current && !MEXICAN_STATES.includes(current) ? [current, ...MEXICAN_STATES] : [...MEXICAN_STATES];
}
