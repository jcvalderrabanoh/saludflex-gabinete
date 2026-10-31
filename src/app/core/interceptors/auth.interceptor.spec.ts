import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('accessToken', 'viejo');
    localStorage.setItem('refreshToken', 'ref');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adjunta el token a la API', () => {
    http.get('http://localhost:3000/facility/catalog').subscribe();
    const req = backend.expectOne('http://localhost:3000/facility/catalog');
    expect(req.request.headers.get('Authorization')).toBe('Bearer viejo');
    req.flush({});
  });

  it('ante un 401 renueva una vez y reintenta con el token nuevo', () => {
    let done = false;
    http.get('http://localhost:3000/facility/catalog').subscribe(() => (done = true));
    backend.expectOne('http://localhost:3000/facility/catalog').flush({}, { status: 401, statusText: 'x' });
    const refresh = backend.expectOne('http://localhost:3000/auth/refresh');
    expect(refresh.request.headers.has('Authorization')).toBeFalse();
    refresh.flush({ success: true, message: 'ok', data: { user: null, accessToken: 'nuevo', refreshToken: 'ref2' } });
    const retry = backend.expectOne('http://localhost:3000/facility/catalog');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retry.flush({});
    expect(done).toBeTrue();
  });
});
