import { CommitmentItem, CommitmentPlan, Expense, RecurringPayment, RecurringPaymentsOverview } from '../../core/models/facility.models';
import { commitmentCuts, expenseSections, periodOf, personalDataError, summaryNote, toExpenseInput, toRecurringInput } from './expenses.helpers';

const item = (over: Partial<CommitmentItem>): CommitmentItem => ({
  source: 'recurring',
  sourceId: 'p1',
  name: 'Luz',
  category: 'utilities',
  dueOn: '2026-11-10',
  overdue: false,
  amountCents: 1000,
  certainty: 'known',
  ...over,
});

const plan = (items: CommitmentItem[], over: Partial<CommitmentPlan> = {}): CommitmentPlan => ({
  today: '2026-11-08',
  until: '2026-12-08',
  items,
  days: [],
  totals: { totalCents: 0, estimatedCents: 0, overdueCents: 0, unknownCount: 0 },
  ...over,
});

const payment = (over: Partial<RecurringPayment>): RecurringPayment => ({
  id: 'p1',
  establishmentId: 'e1',
  name: 'Luz',
  kind: 'service',
  category: 'utilities',
  amountMode: 'variable',
  amountCents: null,
  periodMonths: 2,
  firstDueOn: '2026-09-10',
  endsOn: null,
  overdue: [],
  next: '2026-11-10',
  skipped: [],
  paid: [],
  lastPaid: null,
  ...over,
});

const overview = (payments: RecurringPayment[] = []): RecurringPaymentsOverview => ({ today: '2026-11-08', payments });

const expense = (over: Partial<Expense>): Expense => ({
  id: 'x1',
  establishmentId: 'e1',
  name: 'Toner',
  category: 'supplies',
  amountCents: 5000,
  dueOn: '2026-11-20',
  paidOn: null,
  ...over,
});

describe('commitmentCuts', () => {
  it('da vencido y cuatro cortes semanales; el último llega hasta el fin de los 30 días', () => {
    expect(commitmentCuts(plan([])).map((c) => c.label)).toEqual(['Vencido', '8 al 14 nov', '15 al 21 nov', '22 al 28 nov', '29 nov al 8 dic']);
  });

  it('suma cada corte y arrastra el acumulado', () => {
    const cuts = commitmentCuts(plan([
      item({ dueOn: '2026-10-28', overdue: true, amountCents: 700 }),
      item({ dueOn: '2026-11-10', amountCents: 300 }),
      item({ dueOn: '2026-11-14', amountCents: 100 }),
      item({ dueOn: '2026-12-08', amountCents: 50 }),
    ]));
    expect(cuts.map((c) => c.cutCents)).toEqual([700, 400, 0, 0, 50]);
    expect(cuts.map((c) => c.cumulativeCents)).toEqual([700, 1100, 1100, 1100, 1150]);
  });

  it('lo estimado se reporta aparte y lo sin dato no suma, pero se cuenta', () => {
    const [, week] = commitmentCuts(plan([
      item({ amountCents: 40, certainty: 'estimated' }),
      item({ amountCents: null, certainty: 'unknown' }),
    ]));
    expect(week.cutCents).toBe(40);
    expect(week.estimatedCents).toBe(40);
    expect(week.unknownCount).toBe(1);
  });
});

describe('summaryNote', () => {
  it('sin estimados ni huecos no dice nada', () => {
    expect(summaryNote({ totalCents: 5, estimatedCents: 0, overdueCents: 0, unknownCount: 0 })).toBe('');
  });

  it('avisa lo estimado y lo que no suma', () => {
    expect(summaryNote({ totalCents: 5, estimatedCents: 342000, overdueCents: 0, unknownCount: 1 })).toBe('Incluye $3,420 MXN estimados y 1 concepto sin dato, que no suma.');
    expect(summaryNote({ totalCents: 5, estimatedCents: 0, overdueCents: 0, unknownCount: 2 })).toBe('Hay 2 conceptos sin dato, que no suman.');
  });
});

describe('expenseSections', () => {
  const titles = (sections: { title: string }[]) => sections.map((s) => s.title);

  it('agrupa vencidos y próximos desde los compromisos, y oculta secciones vacías', () => {
    const sections = expenseSections({
      plan: plan([item({ overdue: true, dueOn: '2026-10-28' }), item({ source: 'expense', sourceId: 'x1', name: 'Toner' })]),
      overview: overview([payment({})]),
      expenses: [expense({})],
    }, 'all');
    expect(titles(sections)).toEqual(['Vencidos', 'Próximos 30 días']);
    expect(sections[0].lines[0].status).toBe('overdue');
    expect(sections[1].lines[0].status).toBe('pending');
  });

  it('lleva a «Más adelante» lo que vence después de los 30 días', () => {
    const sections = expenseSections({
      plan: plan([]),
      overview: overview([payment({ id: 'p2', name: 'Predial', next: '2027-01-31', amountMode: 'fixed', amountCents: 900000 })]),
      expenses: [expense({ id: 'x2', name: 'Compra', dueOn: '2027-02-01' })],
    }, 'all');
    expect(titles(sections)).toEqual(['Más adelante']);
    expect(sections[0].lines.map((l) => l.name)).toEqual(['Predial', 'Compra']);
    expect(sections[0].lines[0].certainty).toBe('known');
  });

  it('un servicio terminado no aparece en «Más adelante»', () => {
    const sections = expenseSections({ plan: plan([]), overview: overview([payment({ next: null })]), expenses: [] }, 'all');
    expect(sections).toEqual([]);
  });

  it('junta pagados y omitidos recientes; lo de hace más de 30 días ya no', () => {
    const sections = expenseSections({
      plan: plan([]),
      overview: overview([payment({ next: null, skipped: ['2026-11-01', '2026-01-01'], paid: [{ dueOn: '2026-11-02', paidOn: '2026-11-03', paidCents: 900 }] })]),
      expenses: [expense({ paidOn: '2026-11-05', dueOn: '2026-11-05' }), expense({ id: 'x9', paidOn: '2026-08-01', dueOn: '2026-08-01' })],
    }, 'all');
    expect(titles(sections)).toEqual(['Pagados y omitidos']);
    expect(sections[0].lines.map((l) => l.status)).toEqual(['paid', 'paid', 'skipped']);
    expect(sections[0].lines[1].amountCents).toBe(900);
  });

  it('cada periodo pagado tiene su renglón, aunque se paguen el mismo día', () => {
    const sections = expenseSections({
      plan: plan([]),
      overview: overview([payment({ next: null, paid: [{ dueOn: '2026-10-10', paidOn: '2026-11-03', paidCents: 1 }, { dueOn: '2026-11-10', paidOn: '2026-11-03', paidCents: 2 }] })]),
      expenses: [],
    }, 'all');
    const lines = sections[0].lines;
    expect(lines.map((l) => periodOf(l))).toEqual(jasmine.arrayWithExactContents(['2026-10-10', '2026-11-10']));
    expect(new Set(lines.map((l) => l.key)).size).toBe(2);
  });

  it('filtra por una sola vez o por lo que se repite', () => {
    const data = {
      plan: plan([item({}), item({ source: 'expense', sourceId: 'x1', name: 'Toner' })]),
      overview: overview([payment({})]),
      expenses: [expense({})],
    };
    expect(expenseSections(data, 'once')[0].lines.map((l) => l.source)).toEqual(['expense']);
    expect(expenseSections(data, 'repeat')[0].lines.map((l) => l.source)).toEqual(['recurring']);
  });
});

describe('personalDataError', () => {
  it('acepta un nombre normal', () => {
    expect(personalDataError('Gel y papel térmico')).toBeNull();
    expect(personalDataError('Renta 2026')).toBeNull();
  });

  it('detecta cuentas, RFC y CURP', () => {
    expect(personalDataError('012180001234567891')).toBe('account');
    expect(personalDataError('Honorarios GODE561231GR8')).toBe('personal');
    expect(personalDataError('gode561231hdfnrn09')).toBe('personal');
  });
});

describe('entradas del formulario', () => {
  const base = { name: '  Renta ', category: 'rent' as const, amountMode: 'fixed' as const, amount: '18000', dueOn: '2026-11-10', periodMonths: 1, endsOn: '' };

  it('un gasto pasa pesos a centavos y limpia el nombre', () => {
    expect(toExpenseInput(base)).toEqual({ name: 'Renta', category: 'rent', amountCents: 1800000, dueOn: '2026-11-10' });
  });

  it('un recurrente sin término manda null, y software o plataforma son suscripción', () => {
    expect(toRecurringInput(base)).toEqual({ name: 'Renta', kind: 'service', category: 'rent', amountMode: 'fixed', amountCents: 1800000, periodMonths: 1, firstDueOn: '2026-11-10', endsOn: null });
    expect(toRecurringInput({ ...base, category: 'platform', endsOn: '2027-01-01' })).toEqual(jasmine.objectContaining({ kind: 'subscription', endsOn: '2027-01-01' }));
  });

  it('al editar conserva el tipo que ya tenía', () => {
    expect(toRecurringInput({ ...base, category: 'other' }, 'subscription').kind).toBe('subscription');
  });

  it('un monto variable vacío queda sin dato, no en cero', () => {
    expect(toRecurringInput({ ...base, amountMode: 'variable', amount: '' }).amountCents).toBeNull();
  });
});
