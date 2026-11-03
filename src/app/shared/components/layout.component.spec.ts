import { FacilityAction } from '../../core/services/permissions.service';
import { MOBILE_QUERY, visibleNav } from './layout.component';

const allow = (...actions: FacilityAction[]) => (a: FacilityAction) => actions.includes(a);

describe('menú del layout', () => {
  it('«Equipo» solo con facility.manage y «Carpeta» solo con facility.inspect', () => {
    const labels = (can: (a: FacilityAction) => boolean) => visibleNav(can).map((i) => i.label);
    expect(labels(allow('read', 'record'))).not.toContain('Equipo');
    expect(labels(allow('read', 'record'))).not.toContain('Carpeta de inspección');
    expect(labels(allow('read', 'manage', 'inspect'))).toContain('Equipo');
    expect(labels(allow('read', 'manage', 'inspect'))).toContain('Carpeta de inspección');
  });

  it('Hoy, Documentos y Obligaciones están para todos', () => {
    expect(visibleNav(allow()).map((i) => i.label)).toEqual(['Hoy', 'Documentos', 'Obligaciones', 'Equipos y personal', 'Establecimientos']);
  });

  it('en móvil (< 768 px) la barra lateral se vuelve flotante', () => {
    expect(MOBILE_QUERY).toBe('(max-width: 767.98px)');
  });
});
