import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConnectionsComponent } from './connections.component';

function render(body: object | null, status = 200) {
  const fixture = TestBed.createComponent(ConnectionsComponent);
  const req = TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/facility/connected-apps');
  if (status === 200) req.flush(body);
  else req.flush({}, { status, statusText: 'Error' });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Conexiones', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ConnectionsComponent], providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('una app contratada se abre aparte, sin identificadores en la liga', () => {
    const el = render([{ app: 'lumen-view', state: 'active', trialEndsAt: null }, { app: 'attendance', state: 'not_contracted', trialEndsAt: null }]);
    const open = el.querySelector<HTMLAnchorElement>('a[href^="https://app.lumen-view.com"]');
    expect(open?.textContent).toContain('Abrir lumen-view');
    expect(open?.target).toBe('_blank');
    expect(open?.rel).toContain('noopener');
    expect(open?.search).toBe('');
  });

  it('sin contratar, pide información por correo y no promete activar ni precio', () => {
    const el = render([{ app: 'lumen-view', state: 'active', trialEndsAt: null }, { app: 'attendance', state: 'not_contracted', trialEndsAt: null }]);
    const ask = el.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    expect(ask?.textContent).toContain('Pedir información');
    expect(ask?.href).toContain('Asistencia');
    expect(el.textContent).toContain('No contratada');
    expect(el.textContent).not.toMatch(/activar|precio|\$/i);
  });

  it('la prueba vencida no ofrece abrir: la app ya no dejaría entrar', () => {
    const el = render([{ app: 'lumen-view', state: 'trial_expired', trialEndsAt: '2026-11-01T00:00:00Z' }, { app: 'attendance', state: 'not_contracted', trialEndsAt: null }]);
    expect(el.textContent).toContain('Prueba vencida');
    expect(el.querySelector('a[href^="https://app.lumen-view.com"]')).toBeNull();
  });

  it('avisa que aquí no se ven expedientes ni asistencia', () => {
    const el = render([]);
    expect(el.textContent).toContain('Aquí no se ven expedientes ni asistencia');
  });

  it('si la API falla dice qué pasó, sin inventar un estado', () => {
    const el = render(null, 500);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No pudimos revisar');
    expect(el.textContent).not.toContain('No contratada');
  });
});
