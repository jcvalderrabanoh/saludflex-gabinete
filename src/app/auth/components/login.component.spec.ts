import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';
import { GoogleSignIn } from '../../core/services/google-sign-in';

describe('LoginComponent', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let google: jasmine.SpyObj<GoogleSignIn>;
  let router: Router;
  let returning: boolean;

  function create() {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    returning = false;
    auth = jasmine.createSpyObj('AuthService', ['login', 'selectAccount', 'exchangeGoogle']);
    google = jasmine.createSpyObj('GoogleSignIn', ['start', 'isReturn', 'finish', 'forget']);
    google.start.and.resolveTo();
    google.isReturn.and.callFake(() => returning);
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: GoogleSignIn, useValue: google },
      ],
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
  });

  it('muestra el logo actual de SaludFlex y el nombre del sistema', () => {
    const el: HTMLElement = create().nativeElement;
    expect(el.querySelector('.logo svg')).not.toBeNull();
    expect(el.querySelector('.logo')?.textContent).toContain('SaludFlex');
    expect(el.textContent).toContain('Sistema Integral de Gabinete');
  });

  it('nunca promete cumplimiento («en regla», «certificado»)', () => {
    const text = (create().nativeElement as HTMLElement).textContent!.toLowerCase();
    expect(text).not.toContain('en regla');
    expect(text).not.toContain('certificad');
  });

  it('ofrece «Continuar con Google» antes del correo', () => {
    const el: HTMLElement = create().nativeElement;
    const googleButton = el.querySelector('[data-google]');
    expect(googleButton?.textContent).toContain('Continuar con Google');
    expect(googleButton!.compareDocumentPosition(el.querySelector('input[type=email]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('el botón de Google sale a Auth0', () => {
    const fixture = create();
    fixture.nativeElement.querySelector('[data-google]').click();
    expect(google.start).toHaveBeenCalled();
  });

  it('si Auth0 no carga, avisa y deja entrar con contraseña', async () => {
    google.start.and.rejectWith(new Error('red'));
    const fixture = create();
    fixture.componentInstance.signInWithGoogle();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain('No se pudo entrar con Google');
    expect(fixture.componentInstance.loading()).toBeFalse();
  });

  it('al regresar de Auth0 canjea el token y entra a Hoy', async () => {
    returning = true;
    google.finish.and.resolveTo('auth0-token');
    auth.exchangeGoogle.and.returnValue(of({ kind: 'session' }));
    const fixture = create();
    await fixture.whenStable();
    expect(google.finish).toHaveBeenCalledWith(document.location.href);
    expect(auth.exchangeGoogle).toHaveBeenCalledWith('auth0-token');
    expect(router.navigate).toHaveBeenCalledWith(['/operacion/hoy']);
  });

  it('con varias cuentas tras Google pide elegir (paso 2 de 2)', async () => {
    returning = true;
    google.finish.and.resolveTo('auth0-token');
    auth.exchangeGoogle.and.returnValue(of({ kind: 'select-account', selection: { requiresAccountSelection: true, accounts: [{ id: 'a1', name: 'Clínica Norte' }], selectionToken: 'sel' } }));
    const fixture = create();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Paso 2 de 2');
    expect(text).toContain('Clínica Norte');
  });

  it('si jc-core rechaza el canje, olvida Google y muestra el motivo', async () => {
    returning = true;
    google.finish.and.resolveTo('auth0-token');
    auth.exchangeGoogle.and.returnValue(throwError(() => new Error('La cuenta no tiene el Sistema Integral de Gabinete')));
    const fixture = create();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(google.forget).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain('no tiene el Sistema Integral de Gabinete');
  });
});
