import { RecurringPayment } from '../../core/models/facility.models';
import { amountLabel, paymentSections, periodLabel, toCents, toPaymentInput, unusedSuggestions } from './payments.helpers';

const payment = (over: Partial<RecurringPayment>): RecurringPayment => ({
  id: 'p', establishmentId: 'e', name: 'Luz', kind: 'service', category: 'other', amountMode: 'variable', amountCents: null,
  periodMonths: 2, firstDueOn: '2026-01-10', endsOn: null, overdue: [], next: '2026-11-10', skipped: [], lastPaid: null, ...over,
});

describe('pagos recurrentes: ayudantes', () => {
  describe('paymentSections', () => {
    it('reparte por urgencia y un vencido por periodo, del más viejo al más nuevo', () => {
      const sections = paymentSections([
        payment({ id: 'a', name: 'Luz', overdue: ['2026-09-10', '2026-07-10'], next: '2026-11-10' }),
        payment({ id: 'b', name: 'Predial', next: '2027-01-31' }),
      ], '2026-11-06');
      expect(sections.overdue.map((l) => l.dueOn)).toEqual(['2026-07-10', '2026-09-10']);
      expect(sections.soon.map((l) => l.payment.id)).toEqual(['a']);
      expect(sections.later.map((l) => l.payment.id)).toEqual(['b']);
    });

    it('el día 30 todavía es «próximos»; el 31 ya es «más adelante»', () => {
      const sections = paymentSections([
        payment({ id: 'a', next: '2026-12-06' }),
        payment({ id: 'b', next: '2026-12-07' }),
      ], '2026-11-06');
      expect(sections.soon.map((l) => l.payment.id)).toEqual(['a']);
      expect(sections.later.map((l) => l.payment.id)).toEqual(['b']);
    });
  });

  describe('amountLabel', () => {
    it('sin dato nunca es $0', () => {
      expect(amountLabel(payment({ amountCents: null }))).toBe('Monto variable, sin dato');
    });
    it('monto fijo en formato local con moneda', () => {
      expect(amountLabel(payment({ amountMode: 'fixed', amountCents: 125000 }))).toBe('$1,250 MXN');
    });
    it('el monto variable se marca como aproximado y conserva centavos', () => {
      expect(amountLabel(payment({ amountCents: 123450 }))).toBe('Aprox. $1,234.50 MXN');
    });
  });

  it('periodLabel nombra cada periodicidad', () => {
    expect([1, 2, 3, 4, 6, 12].map(periodLabel)).toEqual(['Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual']);
  });

  describe('toCents', () => {
    it('convierte pesos a centavos sin error de coma flotante', () => {
      expect(toCents(19.99)).toBe(1999);
      expect(toCents(1234.5)).toBe(123450);
    });
    it('vacío es sin dato, no cero', () => {
      expect(toCents(null)).toBeNull();
      expect(toCents('')).toBeNull();
    });
  });

  describe('toPaymentInput', () => {
    const base = { name: '  Agua ', kind: 'service' as const, amountMode: 'fixed' as const, amount: 100, periodMonths: 1, firstDueOn: '2026-11-10' };
    it('limpia el nombre y manda centavos', () => {
      expect(toPaymentInput(base)).toEqual({ name: 'Agua', kind: 'service', amountMode: 'fixed', amountCents: 10000, periodMonths: 1, firstDueOn: '2026-11-10' });
    });
    it('variable sin monto manda null para poder borrarlo al editar', () => {
      expect(toPaymentInput({ ...base, amountMode: 'variable', amount: null }).amountCents).toBeNull();
    });
  });

  it('unusedSuggestions quita lo que ya se sigue, sin importar mayúsculas ni acentos', () => {
    const names = unusedSuggestions(['LUZ', 'teléfono']).map((s) => s.name);
    expect(names).toEqual(['Predial', 'Gas', 'Agua']);
  });
});
