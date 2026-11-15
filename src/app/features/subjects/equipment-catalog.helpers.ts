import { Equipment, EquipmentMaintenance, EquipmentModality, EquipmentType, MaintenanceKind, MaintenancePerformer } from '../../core/models/facility.models';

/** Grupo del selector de tipo (imagen / apoyo). */
export interface CatalogGroup {
  label: string;
  types: EquipmentType[];
}

/** Un mantenimiento listo para pintar en la ficha del equipo. */
export interface MaintenanceRow {
  title: string;
  kind: string;
  period: string;
  basis: string;
  /** Solo lo que la norma fija con numeral verificado. */
  norm: boolean;
  /** Tiene una obligación que avisa de su vencimiento. */
  tracked: boolean;
  tag: string;
  afterRepair: string | null;
  performer: string;
  note: string;
}

const GROUP_LABELS: Record<EquipmentType['category'], string> = {
  imaging: 'Equipo de imagen',
  support: 'Equipo de apoyo',
};

const KIND_LABELS: Record<MaintenanceKind, string> = {
  preventive: 'Mantenimiento preventivo',
  'quality-control': 'Control de calidad',
  acceptance: 'Pruebas de aceptación',
  'electrical-safety': 'Seguridad eléctrica',
  'user-check': 'Revisión del personal',
};

const PERFORMER_LABELS: Record<MaintenancePerformer, string> = {
  provider: 'Proveedor de servicio o fabricante',
  specialist: 'Asesor especializado o físico médico',
  staff: 'Personal del establecimiento',
};

/**
 * Tipo con que jc-core decide las obligaciones de un equipo sin tipo
 * (`DEFAULT_EQUIPMENT_TYPE_BY_MODALITY` de jc-core#922). Si cambia allá, cambia aquí.
 */
const DEFAULT_TYPE_BY_MODALITY: Record<EquipmentModality, string> = {
  xray: 'rx-convencional',
  mammography: 'mastografo',
  ct: 'tomografo',
  ultrasound: 'ultrasonido',
  other: 'otro',
};

const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;

export function catalogGroups(types: EquipmentType[]): CatalogGroup[] {
  return (Object.keys(GROUP_LABELS) as EquipmentType['category'][])
    .map((category) => ({ label: GROUP_LABELS[category], types: types.filter((t) => t.category === category) }))
    .filter((group) => group.types.length > 0);
}

/** «Norma (numeral)» solo si la norma lo fija y se verificó; lo demás es sugerido. */
export function maintenanceBasis(m: EquipmentMaintenance): { label: string; norm: boolean } {
  if (m.basis === 'norm' && m.verification === 'V') return { label: `Norma · ${m.norms.join(', ')}`, norm: true };
  return { label: m.basis === 'manufacturer' ? 'Fabricante' : 'Planeación', norm: false };
}

export function maintenancePeriod(period: EquipmentMaintenance['period']): string {
  if (!period) return 'Sin periodo fijo';
  const { unit, every } = period;
  if (unit === 'month') {
    if (every % MONTHS_PER_YEAR === 0) return every === MONTHS_PER_YEAR ? 'Cada año' : `Cada ${every / MONTHS_PER_YEAR} años`;
    return every === 1 ? 'Cada mes' : `Cada ${every} meses`;
  }
  if (every % DAYS_PER_WEEK === 0) return every === DAYS_PER_WEEK ? 'Cada semana' : `Cada ${every / DAYS_PER_WEEK} semanas`;
  return every === 1 ? 'Cada día' : `Cada ${every} días`;
}

export function maintenanceRows(type: EquipmentType): MaintenanceRow[] {
  return type.maintenance.map((m) => {
    const basis = maintenanceBasis(m);
    const period = m.kind === 'acceptance' && !m.period ? 'Al instalar' : maintenancePeriod(m.period);
    const tracked = m.obligationKey !== null;
    return {
      title: m.title,
      kind: KIND_LABELS[m.kind] ?? m.kind,
      period: m.period && !basis.norm ? `${period} (sugerido)` : period,
      basis: basis.label,
      norm: basis.norm,
      tracked,
      tag: tracked ? 'Con aviso de vencimiento' : 'Recomendado',
      afterRepair: m.afterRepair ? 'También tras reparar' : null,
      performer: PERFORMER_LABELS[m.performer] ?? m.performer,
      note: m.note,
    };
  });
}

/** Fechas AAAA-MM-DD: se comparan como texto. */
export function warrantyBeforeInstall(installedOn: string | null | undefined, warrantyUntil: string | null | undefined): boolean {
  return !!installedOn && !!warrantyUntil && warrantyUntil < installedOn;
}

/** Su tipo, o el de su modalidad (como el backend) marcado `byModality`; `null` si el catálogo no lo tiene. */
export function typeOfEquipment(
  equipment: Pick<Equipment, 'modality' | 'equipmentTypeKey'>,
  types: EquipmentType[],
): { type: EquipmentType; byModality: boolean } | null {
  const own = equipment.equipmentTypeKey ? types.find((t) => t.key === equipment.equipmentTypeKey) : undefined;
  if (own) return { type: own, byModality: false };
  const fallback = types.find((t) => t.key === DEFAULT_TYPE_BY_MODALITY[equipment.modality]);
  return fallback ? { type: fallback, byModality: true } : null;
}
