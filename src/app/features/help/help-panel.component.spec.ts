import { helpTabs } from './help-panel.component';

describe('panel de ayuda', () => {
  it('con facility.manage ofrece configurar y los reportes', () => {
    expect(helpTabs(true).map((t) => t.label)).toEqual(['Configurar', 'Mis reportes']);
  });

  it('sin facility.manage solo ofrece los reportes (el backend tampoco dejaría configurar)', () => {
    expect(helpTabs(false).map((t) => t.label)).toEqual(['Mis reportes']);
  });
});
