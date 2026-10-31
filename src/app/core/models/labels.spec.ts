import { dueLabel } from './labels';

describe('dueLabel', () => {
  it('describe vencimientos en lenguaje de recepción', () => {
    expect(dueLabel(null, null)).toBe('Sin vencimiento');
    expect(dueLabel(0, '2026-10-31')).toBe('Vence hoy (2026-10-31)');
    expect(dueLabel(1, '2026-11-01')).toBe('Faltan 1 día (2026-11-01)');
    expect(dueLabel(20, '2026-11-20')).toBe('Faltan 20 días (2026-11-20)');
    expect(dueLabel(-1, '2026-10-30')).toBe('Venció hace 1 día (2026-10-30)');
    expect(dueLabel(-16, '2026-10-15')).toBe('Venció hace 16 días (2026-10-15)');
  });
});
