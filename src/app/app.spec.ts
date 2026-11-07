import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { CanActivateFn, Router, UrlTree, provideRouter } from '@angular/router';
import { PermissionsService } from './core/services/permissions.service';
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
    expect(operacion?.children?.map((c) => c.path)).toEqual(['hoy', 'documentos', 'obligaciones', 'calendario', 'municipal', 'pagos', 'conexiones', 'equipos-y-personal', 'carpeta', 'establecimientos', 'equipo', 'plataforma', '']);
  });

  describe('guards por permiso', () => {
    const child = (path: string) => routes.find((r) => r.path === 'operacion')?.children?.find((c) => c.path === path);
    const runGuard = (path: string, allowed: (action: string) => boolean) => {
      TestBed.overrideProvider(PermissionsService, { useValue: { can: allowed } });
      const guard = child(path)?.canActivate?.[0] as CanActivateFn | undefined;
      expect(guard).withContext(`la ruta ${path} debe tener guard`).toBeDefined();
      return TestBed.runInInjectionContext(() => guard!({} as never, {} as never));
    };

    it('«Carpeta» sin permiso de inspección regresa a Hoy', () => {
      const result = runGuard('carpeta', () => false);
      expect(result instanceof UrlTree).toBeTrue();
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/operacion/hoy');
    });

    it('«Carpeta» pide justo el permiso de inspección', () => {
      const asked: string[] = [];
      expect(runGuard('carpeta', (a) => (asked.push(a), a === 'inspect'))).toBeTrue();
      expect(asked).toEqual(['inspect']);
    });

    it('«Pagos recurrentes» pide captura global o administrar, porque muestra montos', () => {
      expect(runGuard('pagos', (a) => a === 'payments')).toBeTrue();
    });

    it('«Pagos recurrentes» con solo lectura regresa a Hoy', () => {
      expect(runGuard('pagos', (a) => a === 'read') instanceof UrlTree).toBeTrue();
    });

    it('«Equipo» pide el permiso de administrar', () => {
      expect(runGuard('equipo', (a) => a === 'manage')).toBeTrue();
    });
  });
});
