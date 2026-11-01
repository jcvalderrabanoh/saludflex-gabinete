/** Espejo de los tipos de la API `facility` de jc-core (ADR-005). */

export type ObligationStatus = 'missing' | 'overdue' | 'due-soon' | 'ok';
export type ObligationKind = 'document' | 'periodic';
export type ObligationSubject = 'establishment' | 'person' | 'equipment';
export type NormVerification = 'V' | 'NV';

export type ServiceType =
  | 'xray'
  | 'mammography'
  | 'ct'
  | 'ultrasound'
  | 'laboratory'
  | 'consultation'
  | 'hemodialysis';

export type EstablishmentType =
  | 'consultorio'
  | 'clinica-consulta-externa'
  | 'gabinete-imagen'
  | 'laboratorio-clinico'
  | 'unidad-hemodialisis';

export interface Period {
  unit: 'day' | 'month';
  every: number;
}

export interface Establishment {
  id: string;
  accountId: string;
  name: string;
  type: EstablishmentType;
  legalName?: string | null;
  rfc?: string | null;
  clues?: string | null;
  street?: string | null;
  exteriorNumber?: string | null;
  interiorNumber?: string | null;
  neighborhood?: string | null;
  municipality?: string | null;
  state?: string | null;
  postalCode?: string | null;
  sanitaryResponsibleName?: string | null;
  sanitaryResponsibleLicense?: string | null;
  services: ServiceType[];
  timeZone: string;
}

export type EstablishmentInput = Omit<Establishment, 'id' | 'accountId' | 'timeZone'> & {
  timeZone?: string;
};

export interface ObligationDefinition {
  key: string;
  title: string;
  evidence: string;
  kind: ObligationKind;
  subject: ObligationSubject;
  norms: string[];
  appliesTo: ServiceType[];
  activatedByDefault: boolean;
  period?: Period;
  alertDays: number[];
  weight: number;
  folderOrder: number;
  verification: NormVerification;
  note?: string;
}

export interface Catalog {
  version: string;
  obligations: ObligationDefinition[];
}

export interface EvaluatedObligation {
  id: string;
  catalogKey: string;
  title: string;
  evidence: string;
  kind: ObligationKind;
  subject: ObligationSubject;
  subjectLabel: string | null;
  norms: string[];
  verification: NormVerification;
  note: string | null;
  folderOrder: number;
  weight: number;
  period: Period | null;
  alertDays: number[];
  responsibleUserIds: string[];
  status: ObligationStatus;
  dueOn: string | null;
  daysLeft: number | null;
  alertLevel: number | null;
  currentRecord: {
    id: string;
    performedOn: string;
    validUntil: string | null;
    hasFile: boolean;
  } | null;
}

export interface ReadinessScore {
  percent: number;
  total: number;
  ok: number;
  dueSoon: number;
  overdue: number;
  missing: number;
}

export interface EstablishmentStatus {
  establishmentId: string;
  establishmentName: string;
  today: string;
  timeZone: string;
  score: ReadinessScore;
  obligations: EvaluatedObligation[];
  todayItems: EvaluatedObligation[];
}

export interface EvidenceRecord {
  id: string;
  obligationId: string;
  performedOn: string;
  validUntil: string | null;
  notes: string | null;
  hasFile: boolean;
  evidenceSha256: string | null;
  correctsRecordId: string | null;
  correctionReason: string | null;
  correctedBy: string | null;
  createdByUserId: string;
  createdAt: string;
  accountSeq: string;
  hash: string;
}

export interface EvidenceInput {
  performedOn: string;
  validUntil?: string;
  notes?: string;
  correctionReason?: string;
  file?: File | null;
}

export interface ActivateObligationInput {
  catalogKey: string;
  subjectLabel?: string;
  periodUnit?: 'day' | 'month';
  periodEvery?: number;
  alertDays?: number[];
}

export interface ChainVerification {
  valid: boolean;
  length: number;
  headHash: string;
  brokenAtSeq: number | null;
  reason: string | null;
}

export type EquipmentModality = 'xray' | 'mammography' | 'ct' | 'ultrasound' | 'other';
export type StaffRole =
  | 'medico-radiologo'
  | 'medico'
  | 'tecnico-radiologo'
  | 'enfermeria'
  | 'responsable-sanitario'
  | 'responsable-operacion'
  | 'administrativo';

export interface Equipment {
  id: string;
  establishmentId: string;
  name: string;
  modality: EquipmentModality;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  room?: string | null;
}

export interface Personnel {
  id: string;
  establishmentId: string;
  fullName: string;
  role: StaffRole;
  professionalLicense?: string | null;
  occupationallyExposed: boolean;
}

export interface SubjectResult<T> {
  subject: T;
  activated: { id: string; catalogKey: string }[];
}
