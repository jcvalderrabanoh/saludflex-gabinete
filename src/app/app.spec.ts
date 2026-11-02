import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { GoogleSignIn } from './core/services/google-sign-in';
import { AppComponent } from './app';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes), provideHttpClient(), { provide: GoogleSignIn, useValue: jasmine.createSpyObj('GoogleSignIn', { isReturn: false }) }],
    }).compileComponents();
  });

  it('se crea', () => {
    expect(TestBed.createComponent(AppComponent).componentInstance).toBeTruthy();
  });

  it('el regreso de Auth0 a la raíz (callback ya registrado de lumen-view) llega a /login con su código', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?code=c&state=s');
    expect(router.url).toBe('/login?code=c&state=s');
  });

  it('la raíz sin regreso de Auth0 va a Hoy (y sin sesión, al login)', async () => {
    localStorage.clear();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/login');
  });

  it('las pantallas de operación cuelgan de /operacion y requieren sesión', () => {
    const operacion = routes.find((r) => r.path === 'operacion');
    expect(operacion?.canActivate?.length).toBe(1);
    expect(operacion?.children?.map((c) => c.path)).toEqual(['hoy', 'obligaciones', 'equipos-y-personal', 'carpeta', 'establecimientos', 'plataforma', '']);
  });
});
