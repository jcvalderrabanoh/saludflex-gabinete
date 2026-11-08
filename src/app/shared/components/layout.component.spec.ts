import { FacilityAction } from '../../core/services/permissions.service';
import { MOBILE_QUERY, visibleNavGroups } from './layout.component';

const allow = (...actions: FacilityAction[]) => (a: FacilityAction) => actions.includes(a);

describe('menú del layout', () => {
  const groups = (can: (a: FacilityAction) => boolean) => visibleNavGroups(can).map((g) => [g.label, g.items.map((i) => i.label)]);

  it('agrupa por lo que la persona viene a hacer, con Conexiones al pie', () => {
    expect(groups(allow('read', 'manage', 'inspect', 'payments'))).toEqual([
      ['Día a día', ['Hoy', 'Calendario', 'Documentos']],
      ['En regla', ['Obligaciones', 'Municipal', 'Carpeta de inspección']],
      ['Mi gabinete', ['Pagos recurrentes', 'Inventario', 'Establecimientos', 'Equipos y personal', 'Accesos']],
      ['', ['Conexiones']],
    ]);
  });

  it('con Gastos encendido, «Gastos» reemplaza a «Pagos recurrentes»', () => {
    const labels = visibleNavGroups(allow('payments'), undefined, true).flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain('Gastos');
    expect(labels).not.toContain('Pagos recurrentes');
  });

  it('sin permisos oculta Carpeta, Pagos y Accesos y deja el resto', () => {
    expect(groups(allow())).toEqual([
      ['Día a día', ['Hoy', 'Calendario', 'Documentos']],
      ['En regla', ['Obligaciones', 'Municipal']],
      ['Mi gabinete', ['Establecimientos', 'Equipos y personal']],
      ['', ['Conexiones']],
    ]);
  });

  it('«Accesos» conserva la ruta de «Equipo»: los enlaces guardados siguen sirviendo', () => {
    const items = visibleNavGroups(allow('manage')).flatMap((g) => g.items);
    expect(items.find((i) => i.label === 'Accesos')?.path).toBe('/operacion/equipo');
  });

  it('un grupo que se queda sin entradas no deja su encabezado', () => {
    expect(visibleNavGroups(allow(), [{ label: 'Vacío', items: [{ path: '/x', label: 'X', icon: 'x', requires: 'manage' }] }])).toEqual([]);
  });

  it('en móvil (< 768 px) la barra lateral se vuelve flotante', () => {
    expect(MOBILE_QUERY).toBe('(max-width: 767.98px)');
  });
});
