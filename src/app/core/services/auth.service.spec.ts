import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService, LoginOutcome } from './auth.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const session = { user: { id: 'u1', firstName: 'Ana', lastName: 'L', email: 'a@x.mx', accountId: 'a1' }, accessToken: 'tok', refreshToken: 'ref' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('el login pide una sesión de la app facility y la guarda', () => {
    let outcome: LoginOutcome | undefined;
    auth.login('a@x.mx', 'secreto').subscribe((o) => (outcome = o));
    const req = http.expectOne('http://localhost:3000/auth/login');
    expect(req.request.body).toEqual({ email: 'a@x.mx', password: 'secreto', app: 'facility' });
    req.flush({ success: true, data: session, message: 'ok' });
    expect(outcome).toEqual({ kind: 'session' });
    expect(auth.getToken()).toBe('tok');
    expect(auth.getCurrentUser()?.firstName).toBe('Ana');
  });

  it('con varias cuentas pide elegir y luego completa la sesión', () => {
    let outcome: LoginOutcome | undefined;
    auth.login('a@x.mx', 'secreto').subscribe((o) => (outcome = o));
    http.expectOne('http://localhost:3000/auth/login').flush({
      success: true,
      message: 'ok',
      data: { requiresAccountSelection: true, accounts: [{ id: 'a1', name: 'UDIX' }, { id: 'a2', name: 'Otra' }], selectionToken: 'sel' },
    });
    expect(outcome?.kind).toBe('select-account');
    expect(auth.isAuthenticated()).toBeFalse();

    auth.selectAccount('sel', 'a1').subscribe((o) => (outcome = o));
    const req = http.expectOne('http://localhost:3000/auth/select-account');
    expect(req.request.body).toEqual({ selectionToken: 'sel', accountId: 'a1' });
    req.flush({ success: true, data: session, message: 'ok' });
    expect(outcome).toEqual({ kind: 'session' });
    expect(auth.isAuthenticated()).toBeTrue();
  });

  it('canjea el token de Google (Auth0) por una sesión de la app facility', () => {
    let outcome: LoginOutcome | undefined;
    auth.exchangeGoogle('auth0-token').subscribe((o) => (outcome = o));
    const req = http.expectOne('http://localhost:3000/auth/auth0/exchange');
    expect(req.request.body).toEqual({ auth0Token: 'auth0-token', app: 'facility' });
    req.flush({ success: true, data: session, message: 'ok' });
    expect(outcome).toEqual({ kind: 'session' });
    expect(auth.getToken()).toBe('tok');
  });

  it('logout limpia la sesión aunque el backend falle', () => {
    localStorage.setItem('accessToken', 'tok');
    auth.logout();
    expect(auth.isAuthenticated()).toBeFalse();
    http.expectOne('http://localhost:3000/auth/logout').flush({}, { status: 500, statusText: 'x' });
  });
});
