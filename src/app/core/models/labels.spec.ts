import { MEXICAN_STATES, dueLabel, stateOptions } from './labels';

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

describe('MEXICAN_STATES', () => {
  it('lista las 32 entidades con el nombre que reconoce el backend', () => {
    expect(MEXICAN_STATES.length).toBe(32);
    expect(new Set(MEXICAN_STATES).size).toBe(32);
    expect(MEXICAN_STATES).toContain('Puebla');
    expect(MEXICAN_STATES).toContain('Ciudad de México');
    expect(MEXICAN_STATES).toContain('Estado de México');
  });
});

describe('stateOptions', () => {
  it('ofrece las 32 entidades cuando no hay estado capturado o ya es uno de ellos', () => {
    expect(stateOptions(null)).toEqual([...MEXICAN_STATES]);
    expect(stateOptions('Puebla')).toEqual([...MEXICAN_STATES]);
  });

  it('conserva un estado capturado antes como texto libre para no perderlo al editar', () => {
    const options = stateOptions('CDMX');
    expect(options[0]).toBe('CDMX');
    expect(options.length).toBe(33);
  });
});
