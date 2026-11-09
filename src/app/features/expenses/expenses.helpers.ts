import {
  AttachmentSummary,
  CommitmentCertainty,
  CommitmentItem,
  CommitmentPlan,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ExpenseSuggestion,
  PaymentAttachment,
  PaymentTarget,
  RecurringAmountMode,
  RecurringPayment,
  RecurringPaymentInput,
  RecurringPaymentKind,
  RecurringPaymentsOverview,
} from '../../core/models/facility.models';
import { formatMoney, periodLabel, serviceLabel, toCents } from '../payments/payments.helpers';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_CUT = 7;
const WEEKLY_CUTS = 4;
/** Lo pagado u omitido se ve durante este tiempo; basta para corregir un error. */
const RECENT_DAYS = 30;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const CATEGORY_OPTIONS: readonly { value: ExpenseCategory; label: string }[] = [
  { value: 'rent', label: 'Renta' },
  { value: 'utilities', label: 'Servicios del local' },
  { value: 'payroll', label: 'Nómina (total mensual)' },
  { value: 'supplies', label: 'Insumos' },
  { value: 'equipment', label: 'Equipo' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'software', label: 'Software' },
  { value: 'platform', label: 'Plataformas conectadas' },
  { value: 'taxes', label: 'Impuestos' },
  { value: 'professional_fees', label: 'Honorarios' },
  { value: 'other', label: 'Otros' },
];

export const CERTAINTY_LABEL: Record<CommitmentCertainty, string> = { known: 'Exacto', estimated: 'Estimado', unknown: 'Sin dato' };

export type ExpenseLineStatus = 'overdue' | 'pending' | 'paid' | 'skipped';
export type ExpenseFilter = 'all' | 'once' | 'repeat';

export const STATUS_LABEL: Record<ExpenseLineStatus, string> = { overdue: 'Vencido', pending: 'Por pagar', paid: 'Pagado', skipped: 'Omitido' };

export interface CommitmentCut {
  label: string;
  overdue: boolean;
  cutCents: number;
  cumulativeCents: number;
  estimatedCents: number;
  unknownCount: number;
}

export interface ExpenseLine {
  key: string;
  source: CommitmentItem['source'];
  sourceId: string;
  name: string;
  detail: string;
  dueOn: string;
  amountCents: number | null;
  certainty: CommitmentCertainty;
  status: ExpenseLineStatus;
  /** Periodo del calendario, cuando `dueOn` muestra el día en que se pagó. */
  period?: string;
  /** Soportes de pago (recibo, factura, transferencia). */
  attachments: AttachmentSummary[];
  /** Otros gastos con el mismo monto a pocos días: quizá el mismo pago dos veces. */
  duplicateIds: string[];
}

export interface ExpenseSection {
  key: 'overdue' | 'soon' | 'later' | 'done';
  title: string;
  lines: ExpenseLine[];
}

export interface ExpensesData {
  plan: CommitmentPlan;
  overview: RecurringPaymentsOverview;
  expenses: Expense[];
  /** Soportes subidos sin pago, por leer o por validar. */
  pending?: PaymentAttachment[];
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function rangeLabel(from: string, to: string): string {
  const [, fromMonth, fromDay] = from.split('-').map(Number);
  const [, toMonth, toDay] = to.split('-').map(Number);
  const start = fromMonth === toMonth ? `${fromDay}` : `${fromDay} ${MONTHS[fromMonth - 1]}`;
  return `${start} al ${toDay} ${MONTHS[toMonth - 1]}`;
}

/** Vencido más cuatro cortes de 7 días; el último absorbe los días que sobran. */
export function commitmentCuts(plan: CommitmentPlan): CommitmentCut[] {
  const windows = Array.from({ length: WEEKLY_CUTS }, (_, i) => {
    const from = addDays(plan.today, i * DAYS_PER_CUT);
    const to = i === WEEKLY_CUTS - 1 ? plan.until : addDays(from, DAYS_PER_CUT - 1);
    return { label: rangeLabel(from, to), to };
  });
  const cuts: CommitmentCut[] = [{ label: 'Vencido', to: '' }, ...windows].map(({ label }, i) => ({
    label,
    overdue: i === 0,
    cutCents: 0,
    cumulativeCents: 0,
    estimatedCents: 0,
    unknownCount: 0,
  }));
  for (const item of plan.items) {
    const index = item.overdue ? 0 : windows.findIndex((w) => item.dueOn <= w.to) + 1;
    const cut = cuts[index];
    if (item.certainty === 'unknown') cut.unknownCount += 1;
    if (item.certainty === 'estimated') cut.estimatedCents += item.amountCents ?? 0;
    cut.cutCents += item.amountCents ?? 0;
  }
  let running = 0;
  for (const cut of cuts) {
    running += cut.cutCents;
    cut.cumulativeCents = running;
  }
  return cuts;
}

export function summaryNote({ estimatedCents, unknownCount }: CommitmentPlan['totals']): string {
  const missing = unknownCount === 1 ? '1 concepto sin dato, que no suma' : `${unknownCount} conceptos sin dato, que no suman`;
  const estimated = `${formatMoney(estimatedCents)} estimados`;
  if (estimatedCents > 0 && unknownCount > 0) return `Incluye ${estimated} y ${missing}.`;
  if (estimatedCents > 0) return `Incluye ${estimated}.`;
  return unknownCount > 0 ? `Hay ${missing}.` : '';
}

export function categoryLabel(category: ExpenseCategory): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? 'Otros';
}

function recurringDetail(payment: RecurringPayment): string {
  return `${periodLabel(payment.periodMonths)} · ${categoryLabel(payment.category)}`;
}

const ONCE = 'Una sola vez';

function pendingLine(item: CommitmentItem, payments: ReadonlyMap<string, RecurringPayment>, expenses: ReadonlyMap<string, Expense>): ExpenseLine {
  const payment = payments.get(item.sourceId);
  const expense = item.source === 'expense' ? expenses.get(item.sourceId) : undefined;
  return {
    key: `${item.source}:${item.sourceId}:${item.dueOn}`,
    source: item.source,
    sourceId: item.sourceId,
    name: item.name,
    detail: payment ? recurringDetail(payment) : `${ONCE} · ${categoryLabel(item.category)}`,
    dueOn: item.dueOn,
    amountCents: item.amountCents,
    certainty: item.certainty,
    status: item.overdue ? 'overdue' : 'pending',
    attachments: expense?.attachments ?? (payment?.unpaidAttachments ?? []).filter((a) => a.dueOn === item.dueOn),
    duplicateIds: expense?.possibleDuplicateIds ?? [],
  };
}

function expenseLine(expense: Expense, status: ExpenseLineStatus, dueOn: string): ExpenseLine {
  return {
    key: `expense:${expense.id}:${dueOn}`,
    source: 'expense',
    sourceId: expense.id,
    name: expense.name,
    detail: `${ONCE} · ${categoryLabel(expense.category)}`,
    dueOn,
    amountCents: expense.amountCents,
    certainty: 'known',
    status,
    attachments: expense.attachments ?? [],
    duplicateIds: expense.possibleDuplicateIds ?? [],
  };
}

function recurringLine(
  payment: RecurringPayment,
  line: Pick<ExpenseLine, 'dueOn' | 'amountCents' | 'certainty' | 'status' | 'period'> & Partial<Pick<ExpenseLine, 'attachments'>>,
): ExpenseLine {
  return {
    attachments: [],
    duplicateIds: [],
    ...line,
    key: `recurring:${payment.id}:${line.period ?? line.dueOn}`,
    source: 'recurring',
    sourceId: payment.id,
    name: payment.name,
    detail: recurringDetail(payment),
  };
}

function referenceCertainty(payment: RecurringPayment): CommitmentCertainty {
  if (payment.amountCents === null) return 'unknown';
  return payment.amountMode === 'fixed' ? 'known' : 'estimated';
}

function laterLines({ plan, overview, expenses }: ExpensesData): ExpenseLine[] {
  return [
    ...overview.payments
      .filter((p) => p.next !== null && p.next > plan.until)
      .map((p) => recurringLine(p, { dueOn: p.next as string, amountCents: p.amountCents, certainty: referenceCertainty(p), status: 'pending' })),
    ...expenses.filter((e) => e.paidOn === null && e.dueOn > plan.until).map((e) => expenseLine(e, 'pending', e.dueOn)),
  ].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

function doneLines({ plan, overview, expenses }: ExpensesData): ExpenseLine[] {
  const since = addDays(plan.today, -RECENT_DAYS);
  const paidExpenses = expenses.filter((e) => e.paidOn !== null && e.paidOn >= since).map((e) => expenseLine(e, 'paid', e.paidOn as string));
  const paidPayments = overview.payments.flatMap((p) =>
    p.paid
      .filter((r) => r.paidOn >= since)
      .map((r) =>
        recurringLine(p, {
          dueOn: r.paidOn,
          period: r.dueOn,
          amountCents: r.paidCents,
          certainty: r.paidCents === null ? 'unknown' : 'known',
          status: 'paid',
          attachments: r.attachments ?? [],
        }),
      ),
  );
  const skipped = overview.payments.flatMap((p) =>
    p.skipped.filter((dueOn) => dueOn >= since).map((dueOn) => recurringLine(p, { dueOn, amountCents: null, certainty: 'unknown', status: 'skipped' })),
  );
  return [...paidExpenses, ...paidPayments, ...skipped].sort((a, b) => b.dueOn.localeCompare(a.dueOn));
}

/** El periodo al que apunta «Deshacer» cuando la fecha visible es la del pago. */
export function periodOf(line: ExpenseLine): string {
  return line.period ?? line.dueOn;
}

export function expenseSections(data: ExpensesData, filter: ExpenseFilter): ExpenseSection[] {
  const payments = new Map(data.overview.payments.map((p) => [p.id, p]));
  const expenses = new Map(data.expenses.map((e) => [e.id, e]));
  const pending = data.plan.items.map((item) => pendingLine(item, payments, expenses));
  const passes = (line: ExpenseLine) => filter === 'all' || (filter === 'once' ? line.source === 'expense' : line.source === 'recurring');
  const sections: ExpenseSection[] = [
    { key: 'overdue', title: 'Vencidos', lines: pending.filter((l) => l.status === 'overdue') },
    { key: 'soon', title: 'Próximos 30 días', lines: pending.filter((l) => l.status === 'pending') },
    { key: 'later', title: 'Más adelante', lines: laterLines(data) },
    { key: 'done', title: 'Pagados y omitidos', lines: doneLines(data) },
  ];
  return sections.map((s) => ({ ...s, lines: s.lines.filter(passes) })).filter((s) => s.lines.length > 0);
}

/** jc-core los rechaza igual; aquí se avisa antes de guardar. */
const ACCOUNT_LIKE_DIGITS = /(\d[\s-]*){8,}/;
const PERSONAL_ID_LIKE = /[a-zñ&]{3,4}\d{6}[a-z0-9]{3}/i;

export function personalDataError(value: string): 'account' | 'personal' | null {
  if (ACCOUNT_LIKE_DIGITS.test(value)) return 'account';
  return PERSONAL_ID_LIKE.test(value) ? 'personal' : null;
}

export interface ExpenseFormValue {
  name: string;
  category: ExpenseCategory;
  supplierId?: string | null;
  amountMode: RecurringAmountMode;
  amount: number | string | null;
  dueOn: string;
  periodMonths: number;
  endsOn: string;
  /** Número de servicio o medidor (solo recurrentes). */
  reference?: string;
}

export function toExpenseInput(value: ExpenseFormValue): ExpenseInput {
  return {
    name: value.name.trim(),
    category: value.category,
    amountCents: toCents(value.amount) ?? 0,
    dueOn: value.dueOn,
    supplierId: value.supplierId || null,
  };
}

const SUBSCRIPTION_CATEGORIES: readonly ExpenseCategory[] = ['software', 'platform'];

/** `kind` solo viene al editar: lo que ya era suscripción sigue siéndolo. */
export function toRecurringInput(value: ExpenseFormValue, kind?: RecurringPaymentKind): RecurringPaymentInput {
  return {
    name: value.name.trim(),
    kind: kind ?? (SUBSCRIPTION_CATEGORIES.includes(value.category) ? 'subscription' : 'service'),
    category: value.category,
    amountMode: value.amountMode,
    amountCents: toCents(value.amount),
    periodMonths: value.periodMonths,
    firstDueOn: value.dueOn,
    endsOn: value.endsOn || null,
    supplierId: value.supplierId || null,
    reference: value.reference?.trim() || null,
  };
}

/* ---------- Soportes de pago y duplicados ---------- */

/** jc-core rechaza lo mismo: un folio no es tarjeta, CLABE, RFC ni CURP. */
const CARD_OR_CLABE_DIGITS = /(\d[\s-]*){15,}/;
export const MAX_REFERENCE_LENGTH = 60;
export const MAX_REFERENCES = 10;

export function isSafeReference(value: string): boolean {
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_REFERENCE_LENGTH && !CARD_OR_CLABE_DIGITS.test(text) && !PERSONAL_ID_LIKE.test(text);
}

/** Folios separados por coma o renglón, sin repetidos. */
export function parseReferences(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((r) => r.trim()).filter(Boolean))];
}

/** Por qué no se pueden guardar las referencias, o null si se puede. */
export function referencesError(references: readonly string[]): string | null {
  if (references.length > MAX_REFERENCES) return `Máximo ${MAX_REFERENCES} referencias.`;
  const bad = references.find((r) => !isSafeReference(r));
  return bad ? `«${bad}» parece tarjeta, CLABE, RFC o CURP, o es muy largo: deja solo folios.` : null;
}

export const ATTACHMENT_STATE_LABEL: Record<PaymentAttachment['state'], string> = {
  queued: 'En cola para leer',
  reading: 'Leyendo…',
  review: 'Listo para validar',
  failed: 'No se pudo leer: captura a mano',
  validating: 'Se estaba validando: revisa si el pago ya quedó antes de validar otra vez',
  blocked: 'Traía datos de pacientes: se borró',
  attached: 'En un pago',
  removed: 'Quitado',
};

/** Una línea corta con lo que propuso la IA. */
export function suggestionSummary(suggestion: ExpenseSuggestion | null): string {
  if (!suggestion) return '';
  const parts = [suggestion.name ?? suggestion.documentType];
  if (suggestion.amountCents !== null) parts.push(formatMoney(suggestion.amountCents));
  else if (suggestion.currency && suggestion.currency !== 'MXN') parts.push(`en ${suggestion.currency}: captura el monto en pesos`);
  if (suggestion.paidOn) parts.push(`pagado el ${suggestion.paidOn}`);
  if (suggestion.supplierName) parts.push(suggestion.supplierName);
  return parts.join(' · ');
}

/** Los pagos registrados a los que se puede unir un soporte. */
export type PaymentSources = Pick<ExpensesData, 'expenses' | 'overview'>;

/** Un pago al que se puede unir algo, con su nombre para elegirlo. */
export interface TargetOption {
  key: string;
  target: PaymentTarget;
  label: string;
  amountCents: number | null;
  paidOn: string | null;
  /** Lo marcó la IA o el monto y la fecha: aparece primero. */
  likely: boolean;
}

export function targetKey(target: PaymentTarget): string {
  return target.expenseId ? `e:${target.expenseId}` : `r:${target.recurringPaymentId}:${target.dueOn}`;
}

/**
 * Pagos a los que unir un soporte o un gasto duplicado: gastos sin anular y
 * periodos recurrentes vencidos, próximos o pagados recientemente. Los
 * probables (duplicados) van primero.
 */
export function targetOptions(data: PaymentSources, likely: readonly PaymentTarget[] = [], excludeExpenseId?: string): TargetOption[] {
  const likelyKeys = new Set(likely.map(targetKey));
  const options: TargetOption[] = [];
  for (const e of data.expenses) {
    if (e.id === excludeExpenseId) continue;
    const target = { expenseId: e.id };
    options.push({
      key: targetKey(target),
      target,
      label: `${e.name} · ${formatMoney(e.amountCents)} · ${e.paidOn ? `pagado ${e.paidOn}` : `vence ${e.dueOn}`}`,
      amountCents: e.amountCents,
      paidOn: e.paidOn,
      likely: likelyKeys.has(targetKey(target)),
    });
  }
  for (const p of data.overview.payments) {
    const periods = new Map<string, { paidOn: string | null; paidCents: number | null }>();
    for (const dueOn of p.overdue) periods.set(dueOn, { paidOn: null, paidCents: p.amountCents });
    if (p.next) periods.set(p.next, { paidOn: null, paidCents: p.amountCents });
    for (const r of p.paid) periods.set(r.dueOn, { paidOn: r.paidOn, paidCents: r.paidCents });
    for (const [dueOn, period] of periods) {
      const target = { recurringPaymentId: p.id, dueOn };
      const amount = period.paidCents === null ? '' : ` · ${formatMoney(period.paidCents)}`;
      options.push({
        key: targetKey(target),
        target,
        label: `${serviceLabel(p)} (periodo ${dueOn})${amount} · ${period.paidOn ? `pagado ${period.paidOn}` : 'por pagar'}`,
        amountCents: period.paidCents,
        paidOn: period.paidOn,
        likely: likelyKeys.has(targetKey(target)),
      });
    }
  }
  return options.sort((a, b) => Number(b.likely) - Number(a.likely) || a.label.localeCompare(b.label));
}

/** Al unir, ¿hay que elegir con qué monto y fecha se queda? */
export function mergeNeedsChoice(source: Pick<Expense, 'amountCents' | 'paidOn'>, target: Pick<TargetOption, 'amountCents' | 'paidOn'>): boolean {
  const amountDiffers = target.amountCents !== null && target.amountCents !== source.amountCents;
  const dateDiffers = target.paidOn !== null && source.paidOn !== null && target.paidOn !== source.paidOn;
  return amountDiffers || dateDiffers;
}

/** Lo mínimo para dar de alta un servicio a partir de un recibo. */
export interface ServiceDefaults {
  name: string;
  periodMonths: number;
  /** Un número de servicio o medidor que traiga el recibo (solo dígitos). */
  reference: string;
}

const KNOWN_SERVICES: readonly { pattern: RegExp; name: string; periodMonths: number }[] = [
  { pattern: /\bluz\b|\bcfe\b|electric/i, name: 'Luz', periodMonths: 2 },
  { pattern: /\bagua\b|sacmex|siapa|conagua/i, name: 'Agua', periodMonths: 2 },
  { pattern: /\bgas\b/i, name: 'Gas', periodMonths: 1 },
  { pattern: /tel[eé]fono|internet|telmex|izzi|totalplay|megacable/i, name: 'Teléfono e internet', periodMonths: 1 },
  { pattern: /predial/i, name: 'Predial', periodMonths: 12 },
  { pattern: /renta|arrendamiento/i, name: 'Renta', periodMonths: 1 },
];

export function serviceDefaults(suggestion: ExpenseSuggestion | null | undefined, references: readonly string[]): ServiceDefaults {
  const text = [suggestion?.documentType, suggestion?.supplierName, suggestion?.name].filter(Boolean).join(' ');
  const known = KNOWN_SERVICES.find((s) => s.pattern.test(text));
  const candidates = [...references, ...(suggestion?.references ?? [])];
  const reference = candidates.map((r) => r.replace(/[\s-]/g, '')).find((r) => /^\d{8,14}$/.test(r)) ?? '';
  return {
    name: known?.name ?? suggestion?.supplierName ?? suggestion?.name ?? '',
    periodMonths: known?.periodMonths ?? 1,
    reference,
  };
}

/** Prefijo de las opciones «dar de alta este servicio» en la lista de pagos. */
export const NEW_SERVICE = 'new:';

export interface NewServiceOption {
  key: string;
  label: string;
  name: string;
  periodMonths: number;
}

const COMMON_SERVICES: readonly { name: string; periodMonths: number }[] = [
  { name: 'Luz', periodMonths: 2 },
  { name: 'Agua', periodMonths: 2 },
  { name: 'Gas', periodMonths: 1 },
  { name: 'Teléfono e internet', periodMonths: 1 },
  { name: 'Renta', periodMonths: 1 },
  { name: 'Predial', periodMonths: 12 },
];

/** Servicios comunes para dar de alta; el que reconoció la IA va primero. */
export function newServiceOptions(defaults: ServiceDefaults): NewServiceOption[] {
  const common = COMMON_SERVICES.map((s) => ({ key: `${NEW_SERVICE}${s.name}`, label: `${s.name} (nuevo)`, ...s }));
  const detected = common.find((o) => o.name === defaults.name);
  const other: NewServiceOption = {
    key: `${NEW_SERVICE}otro`,
    label: detected || !defaults.name ? 'Otro servicio (nuevo)' : `${defaults.name} (nuevo)`,
    name: detected ? '' : defaults.name,
    periodMonths: defaults.periodMonths,
  };
  const rest = common.filter((o) => o !== detected);
  return [...(detected ? [{ ...detected, label: `★ ${detected.label}` }] : []), ...(detected || !defaults.name ? [] : [{ ...other, label: `★ ${other.label}` }]), ...rest, ...(detected || !defaults.name ? [other] : [])];
}

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/**
 * Lo que queda elegido al abrir: el que reconoció la IA; si no, el único
 * servicio registrado con ese nombre («Luz»); si no hay, darlo de alta.
 */
export function initialTarget(options: readonly TargetOption[], sources: PaymentSources, defaults: ServiceDefaults, canManage: boolean): string {
  const likely = options.find((o) => o.likely);
  if (likely) return likely.key;
  if (defaults.name) {
    const named = sources.overview.payments.filter((p) => plain(p.name).startsWith(plain(defaults.name)));
    if (named.length === 1) {
      const period = options.find((o) => o.target.recurringPaymentId === named[0].id && !o.paidOn);
      if (period) return period.key;
    }
  }
  if (!canManage) return '';
  const fresh = newServiceOptions(defaults)[0];
  return defaults.name && fresh ? fresh.key : '';
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`;
}

/** «Periodo facturado 5 sep 2026 – 5 nov 2026», o vacío si el recibo no lo trae. */
export function billedLabel(period: { billedFrom?: string | null; billedTo?: string | null }): string {
  return period.billedFrom && period.billedTo ? `Periodo facturado ${shortDate(period.billedFrom)} – ${shortDate(period.billedTo)}` : '';
}
