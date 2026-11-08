/** Espejo de los tipos de la API `facility` de jc-core (ADR-005). */

export type ObligationStatus = 'missing' | 'overdue' | 'due-soon' | 'ok';
export type ObligationKind = 'document' | 'periodic';
export type ObligationSubject = 'establishment' | 'person' | 'equipment';
export type NormVerification = 'V' | 'NV';
/** Descarga de listados: libro de Excel o ZIP con un CSV por listado. */
export type ExportFormat = 'xlsx' | 'csv';

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
  /** Dónde rige si es estatal o municipal; sin él, en todo el país. */
  jurisdictions?: { state: string; municipalities?: string[] }[];
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

/** Plazo para pagar o tramitar: de la fecha A (`startsOn`) a la fecha B (`endsOn`). */
export interface PaymentWindow {
  startsOn: string;
  endsOn: string;
}

/** El plazo evaluado por la API: pagado si hay un registro desde la fecha A. */
export interface EvaluatedPaymentWindow extends PaymentWindow {
  paid: boolean;
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
  /** Nombres resueltos por el backend; `valid=false` si ya no puede capturar o salió de la cuenta. */
  responsibles?: ObligationResponsible[];
  status: ObligationStatus;
  dueOn: string | null;
  daysLeft: number | null;
  alertLevel: number | null;
  /** Plazo de pago, si tiene; sin pagar, `dueOn` es la fecha B. */
  window?: EvaluatedPaymentWindow | null;
  currentRecord: {
    id: string;
    performedOn: string;
    validUntil: string | null;
    hasFile: boolean;
  } | null;
}

export interface ObligationResponsible {
  id: string;
  name: string;
  valid: boolean;
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
  /** Autor resuelto («Usuario dado de baja» si ya no existe). */
  createdBy?: { id: string; name: string };
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
  /** Solo en equipos: servicio que el equipo implica y el establecimiento no tiene. */
  missingService?: ServiceType | null;
}

/** Sugerencia de la IA al leer un documento (POST …/evidence/analyze). No guarda nada. */
export interface EvidenceAnalysis {
  documentType: string;
  obligation: { id: string; catalogKey: string; title: string; subjectLabel: string | null } | null;
  fields: { performedOn: string | null; validUntil: string | null; notes: string | null };
  /** Porcentajes enteros 0..100. */
  confidence: { overall: number; obligation: number; performedOn: number; validUntil: number };
  warnings: string[];
  ocr: { source: 'text-layer' | 'vision'; chars: number };
  model: string;
  promptVersion: string;
}

export type DocumentState =
  | 'queued' | 'reading' | 'classified' | 'unknown' | 'illegible' | 'blocked'
  | 'failed' | 'linking' | 'linked' | 'discarded' | 'expired';

/** Documento de la bandeja (GET …/documents). */
export interface FacilityDocument {
  id: string;
  establishmentId: string;
  state: DocumentState;
  originalName: string | null;
  contentType: string;
  sizeBytes: number;
  suggestion: Omit<EvidenceAnalysis, 'ocr' | 'model' | 'promptVersion'> | null;
  detectedType: string | null;
  confidence: number | null;
  suggestedObligationId: string | null;
  lastError: string | null;
  evidenceRecordId: string | null;
  purgeAfter: string | null;
  hasFile: boolean;
  createdAt: string;
}

export interface LinkDocumentInput {
  obligationId: string;
  performedOn: string;
  validUntil?: string;
  notes?: string;
}

/** Preajustes al invitar (lista blanca del backend: nunca `manage` ni `inspect`). */
export type TeamPreset = 'coordinador' | 'responsable' | 'consulta';
export type TeamMemberStatus = 'active' | 'invited' | 'inactive';

/** Persona del equipo del gabinete (GET /facility/team). */
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  status: TeamMemberStatus;
  /** Solo permisos `facility.*`. */
  permissions: string[];
  isManager: boolean;
}

/**
 * Respuesta de POST /facility/team/invitations. `invited=false`: la persona ya era
 * de la cuenta (solo se ajustaron permisos) o falló el envío del correo.
 */
export interface InviteMemberResult {
  member: TeamMember;
  invited: boolean;
}

/** Respuesta de POST /facility/team/:userId/resend: `invited=false` si no se pudo mandar el correo. */
export interface ResendInvitationResult {
  invited: boolean;
}

export interface InviteMemberInput {
  email: string;
  name: string;
  preset: TeamPreset;
}

export type AppointmentKind = 'service' | 'filing' | 'inspection' | 'other';
export type AppointmentState = 'scheduled' | 'done';

/** Cita del calendario (fumigación, solicitud de un permiso, visita). Cancelar la borra del calendario. */
export interface Appointment {
  id: string;
  establishmentId: string;
  obligationId: string | null;
  kind: AppointmentKind;
  title: string;
  scheduledOn: string;
  startTime: string | null;
  location: string | null;
  notes: string | null;
  state: AppointmentState;
}

export interface AppointmentInput {
  kind: AppointmentKind;
  scheduledOn: string;
  title?: string;
  startTime?: string;
  obligationId?: string;
  location?: string;
  notes?: string;
}

/** Al editar, `null` borra un campo opcional; lo que no viene no cambia. */
export interface AppointmentUpdate {
  kind?: AppointmentKind;
  scheduledOn?: string;
  title?: string;
  startTime?: string | null;
  obligationId?: string | null;
  location?: string | null;
  notes?: string | null;
  state?: AppointmentState;
}

export interface DateRange {
  from: string;
  to: string;
}

export type RecurringPaymentKind = 'service' | 'subscription';
export type RecurringAmountMode = 'fixed' | 'variable';
export type ExpenseCategory = 'rent' | 'utilities' | 'payroll' | 'supplies' | 'equipment' | 'maintenance' | 'software' | 'platform' | 'taxes' | 'professional_fees' | 'other';

export interface RecurringPaymentInput {
  name: string;
  kind: RecurringPaymentKind;
  amountMode: RecurringAmountMode;
  /** MXN en centavos. `null` es sin dato, nunca cero. */
  amountCents: number | null;
  periodMonths: number;
  firstDueOn: string;
  category?: ExpenseCategory;
  endsOn?: string | null;
}

export interface PaidPeriod {
  dueOn: string;
  paidOn: string;
  paidCents: number | null;
}

export interface RecurringPayment extends RecurringPaymentInput {
  id: string;
  establishmentId: string;
  category: ExpenseCategory;
  endsOn: string | null;
  overdue: string[];
  /** `null` cuando el servicio ya terminó. */
  next: string | null;
  skipped: string[];
  paid: PaidPeriod[];
  lastPaid: PaidPeriod | null;
}

export interface RecurringPaymentsOverview {
  today: string;
  payments: RecurringPayment[];
}

export interface MarkPaidInput {
  dueOn: string;
  paidOn?: string;
  paidCents?: number;
}

export interface ExpenseInput {
  name: string;
  category: ExpenseCategory;
  amountCents: number;
  dueOn: string;
}

export interface Expense extends ExpenseInput {
  id: string;
  establishmentId: string;
  paidOn: string | null;
}

export interface ExpensesList {
  today: string;
  expenses: Expense[];
}

export type CommitmentCertainty = 'known' | 'estimated' | 'unknown';

export interface CommitmentItem {
  source: 'recurring' | 'expense';
  sourceId: string;
  name: string;
  category: ExpenseCategory;
  dueOn: string;
  overdue: boolean;
  /** `null` es sin dato: no suma y nunca se muestra como cero. */
  amountCents: number | null;
  certainty: CommitmentCertainty;
}

export interface CommitmentPlan {
  today: string;
  until: string;
  items: CommitmentItem[];
  days: { dueOn: string; dayCents: number; cumulativeCents: number; cumulativeEstimatedCents: number; unknownCount: number }[];
  totals: { totalCents: number; estimatedCents: number; overdueCents: number; unknownCount: number };
}

export type ConnectableApp = 'lumen-view' | 'attendance';
export type ConnectedAppState = 'active' | 'trial' | 'trial_expired' | 'not_contracted';

export interface ConnectedApp {
  app: ConnectableApp;
  state: ConnectedAppState;
  trialEndsAt: string | null;
}
