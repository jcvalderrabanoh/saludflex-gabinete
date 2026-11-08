import {
  CommitmentCertainty,
  CommitmentItem,
  CommitmentPlan,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  RecurringAmountMode,
  RecurringPayment,
  RecurringPaymentInput,
  RecurringPaymentKind,
  RecurringPaymentsOverview,
} from '../../core/models/facility.models';
import { formatMoney, periodLabel, toCents } from '../payments/payments.helpers';

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

function pendingLine(item: CommitmentItem, payments: ReadonlyMap<string, RecurringPayment>): ExpenseLine {
  const payment = payments.get(item.sourceId);
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
  };
}

function recurringLine(payment: RecurringPayment, line: Pick<ExpenseLine, 'dueOn' | 'amountCents' | 'certainty' | 'status' | 'period'>): ExpenseLine {
  return { ...line, key: `recurring:${payment.id}:${line.period ?? line.dueOn}`, source: 'recurring', sourceId: payment.id, name: payment.name, detail: recurringDetail(payment) };
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
      .map((r) => recurringLine(p, { dueOn: r.paidOn, period: r.dueOn, amountCents: r.paidCents, certainty: r.paidCents === null ? 'unknown' : 'known', status: 'paid' })),
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
  const pending = data.plan.items.map((item) => pendingLine(item, payments));
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
  amountMode: RecurringAmountMode;
  amount: number | string | null;
  dueOn: string;
  periodMonths: number;
  endsOn: string;
}

export function toExpenseInput(value: ExpenseFormValue): ExpenseInput {
  return { name: value.name.trim(), category: value.category, amountCents: toCents(value.amount) ?? 0, dueOn: value.dueOn };
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
  };
}
