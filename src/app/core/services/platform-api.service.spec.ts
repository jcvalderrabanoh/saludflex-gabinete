import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlatformApiService } from './platform-api.service';

describe('PlatformApiService', () => {
  let api: PlatformApiService;
  let http: HttpTestingController;
  const base = 'http://localhost:3000/internal/platform';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PlatformApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('isPlatformAdmin: true con 200, false con 403 (no rompe la app)', () => {
    let ok: boolean | undefined;
    api.isPlatformAdmin().subscribe((v) => (ok = v));
    http.expectOne(`${base}/me`).flush({ email: 'jc@x.mx' });
    expect(ok).toBeTrue();

    api.isPlatformAdmin().subscribe((v) => (ok = v));
    http.expectOne(`${base}/me`).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(ok).toBeFalse();
  });

  it('unir a una app manda solo los usuarios elegidos; sin elegir, no manda la lista', () => {
    api.enableApp('a1', 'facility', ['u1']).subscribe();
    expect(http.expectOne(`${base}/accounts/a1/apps`).request.body).toEqual({ app: 'facility', userIds: ['u1'] });
    api.enableApp('a1', 'facility', []).subscribe();
    expect(http.expectOne(`${base}/accounts/a1/apps`).request.body).toEqual({ app: 'facility' });
  });

  it('buscar manda la consulta como parámetro', () => {
    api.search('udix').subscribe();
    const req = http.expectOne((r) => r.url === `${base}/accounts`);
    expect(req.request.params.get('q')).toBe('udix');
    req.flush([]);
  });
});
