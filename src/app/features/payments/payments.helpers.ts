import { RecurringAmountMode, RecurringPayment, RecurringPaymentInput, RecurringPaymentKind } from '../../core/models/facility.models';

/** Hasta aquí un pago cuenta como «próximo». */
const SOON_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export const PERIOD_OPTIONS: readonly { months: number; label: string }[] = [
  { months: 1, label: 'Mensual' },
  { months: 2, label: 'Bimestral' },
  { months: 3, label: 'Trimestral' },
  { months: 4, label: 'Cuatrimestral' },
  { months: 6, label: 'Semestral' },
  { months: 12, label: 'Anual' },
];

export interface ServiceSuggestion {
  name: string;
  periodMonths: number;
  amountMode: RecurringAmountMode;
}

/** Los que casi todo local paga; lo demás se agrega a mano. */
export const SERVICE_SUGGESTIONS: readonly ServiceSuggestion[] = [
  { name: 'Predial', periodMonths: 12, amountMode: 'fixed' },
  { name: 'Luz', periodMonths: 2, amountMode: 'variable' },
  { name: 'Gas', periodMonths: 1, amountMode: 'variable' },
  { name: 'Agua', periodMonths: 2, amountMode: 'variable' },
  { name: 'Teléfono', periodMonths: 1, amountMode: 'fixed' },
];

export interface PaymentLine {
  payment: RecurringPayment;
  dueOn: string;
}

export interface PaymentSections {
  overdue: PaymentLine[];
  soon: PaymentLine[];
  later: PaymentLine[];
}

const byDue = (a: PaymentLine, b: PaymentLine) => a.dueOn.localeCompare(b.dueOn);
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;

/** Un renglón por cada periodo vencido y uno por el próximo pago de cada servicio. */
export function paymentSections(payments: readonly RecurringPayment[], today: string): PaymentSections {
  const nextLines = payments.flatMap((payment) => (payment.next ? [{ payment, dueOn: payment.next }] : []));
  const isSoon = (line: PaymentLine) => dayNumber(line.dueOn) - dayNumber(today) <= SOON_DAYS;
  return {
    overdue: payments.flatMap((payment) => payment.overdue.map((dueOn) => ({ payment, dueOn }))).sort(byDue),
    soon: nextLines.filter(isSoon).sort(byDue),
    later: nextLines.filter((line) => !isSoon(line)).sort(byDue),
  };
}

export function formatMoney(cents: number): string {
  const decimals = cents % 100 === 0 ? 0 : 2;
  const amount = (cents / 100).toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `$${amount} MXN`;
}

export function amountLabel(payment: Pick<RecurringPayment, 'amountMode' | 'amountCents'>): string {
  if (payment.amountCents === null) return 'Monto variable, sin dato';
  const money = formatMoney(payment.amountCents);
  return payment.amountMode === 'fixed' ? money : `Aprox. ${money}`;
}

export function periodLabel(months: number): string {
  return PERIOD_OPTIONS.find((p) => p.months === months)?.label ?? `Cada ${months} meses`;
}

/** Pesos a centavos; vacío es «sin dato», no cero. */
export function toCents(pesos: number | string | null | undefined): number | null {
  if (pesos === null || pesos === undefined || pesos === '') return null;
  return Math.round(Number(pesos) * 100);
}

export interface ServiceFormValue {
  name: string;
  kind: RecurringPaymentKind;
  amountMode: RecurringAmountMode;
  amount: number | string | null;
  periodMonths: number;
  firstDueOn: string;
}

export function toPaymentInput(value: ServiceFormValue): RecurringPaymentInput {
  return {
    name: value.name.trim(),
    kind: value.kind,
    amountMode: value.amountMode,
    amountCents: toCents(value.amount),
    periodMonths: value.periodMonths,
    firstDueOn: value.firstDueOn,
  };
}

const normalized = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

export function unusedSuggestions(followedNames: readonly string[]): ServiceSuggestion[] {
  const followed = new Set(followedNames.map(normalized));
  return SERVICE_SUGGESTIONS.filter((s) => !followed.has(normalized(s.name)));
}
