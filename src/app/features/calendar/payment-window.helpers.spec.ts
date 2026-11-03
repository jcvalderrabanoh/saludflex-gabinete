import { windowState } from './payment-window.helpers';

describe('windowState', () => {
  const window = { startsOn: '2027-01-01', endsOn: '2027-03-31', paid: false };

  it('antes de abrir: próximo, con los días que faltan para que abra', () => {
    expect(windowState(window, '2026-12-27')).toEqual({ state: 'upcoming', label: 'Abre en 5 días' });
  });

  it('un día antes de abrir lo dice en singular', () => {
    expect(windowState(window, '2026-12-31').label).toBe('Abre mañana');
  });

  it('abierto: cuántos días quedan para la fecha B', () => {
    expect(windowState(window, '2027-03-21')).toEqual({ state: 'open', label: 'Abierto · vence en 10 días' });
  });

  it('el día A ya está abierto', () => {
    expect(windowState(window, '2027-01-01').state).toBe('open');
  });

  it('el día B vence hoy; al día siguiente, vencido', () => {
    expect(windowState(window, '2027-03-31').label).toBe('Abierto · vence hoy');
    expect(windowState(window, '2027-04-01')).toEqual({ state: 'overdue', label: 'Vencido' });
  });

  it('pagado manda sobre las fechas', () => {
    expect(windowState({ ...window, paid: true }, '2027-04-10')).toEqual({ state: 'paid', label: 'Pagado' });
  });
});
