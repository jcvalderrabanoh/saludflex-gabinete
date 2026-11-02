import { TestBed } from '@angular/core/testing';
import { AUTH0_CLIENT, GoogleSignIn } from './google-sign-in';

const ORIGIN = window.location.origin;
/** El SDK se carga bajo demanda: el logout sale tras resolver la carga. */
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('GoogleSignIn', () => {
  let client: jasmine.SpyObj<{
    loginWithRedirect: (o: unknown) => Promise<void>;
    handleRedirectCallback: (url: string) => Promise<unknown>;
    getTokenSilently: () => Promise<string>;
    logout: (o: unknown) => Promise<void>;
  }>;
  let google: GoogleSignIn;

  beforeEach(() => {
    localStorage.clear();
    client = jasmine.createSpyObj('Auth0Client', ['loginWithRedirect', 'handleRedirectCallback', 'getTokenSilently', 'logout']);
    client.loginWithRedirect.and.resolveTo();
    client.handleRedirectCallback.and.resolveTo({});
    client.getTokenSilently.and.resolveTo('auth0-token');
    client.logout.and.resolveTo();
    TestBed.configureTestingModule({
      providers: [{ provide: AUTH0_CLIENT, useValue: () => Promise.resolve(client) }],
    });
    google = TestBed.inject(GoogleSignIn);
  });

  // Sin `connection`, Auth0 mostraría su propio formulario de contraseña, que no es la de Gabinete.
  it('start va directo al selector de cuentas de Google', async () => {
    await google.start();
    expect(client.loginWithRedirect).toHaveBeenCalledWith({ authorizationParams: { connection: 'google-oauth2' } });
  });

  it('reconoce el regreso de Auth0 con código', () => {
    expect(google.isReturn(`${ORIGIN}/login?code=c&state=s`)).toBeTrue();
  });

  it('reconoce el regreso con error (se canceló en Google)', () => {
    expect(google.isReturn(`${ORIGIN}/login?error=access_denied&state=s`)).toBeTrue();
  });

  it('un login normal no es un regreso', () => {
    expect(google.isReturn(`${ORIGIN}/login?returnUrl=%2Foperacion`)).toBeFalse();
  });

  it('finish devuelve el token de Auth0 para el canje', async () => {
    const url = `${ORIGIN}/login?code=c&state=s`;
    await expectAsync(google.finish(url)).toBeResolvedTo('auth0-token');
    expect(client.handleRedirectCallback).toHaveBeenCalledWith(url);
  });

  it('finish lanza si Auth0 no entrega token', async () => {
    client.getTokenSilently.and.resolveTo('');
    await expectAsync(google.finish(`${ORIGIN}/login?code=c&state=s`)).toBeRejectedWithError('Auth0 no entregó un token');
  });

  it('finish propaga el rechazo de Auth0', async () => {
    client.handleRedirectCallback.and.rejectWith(new Error('access_denied'));
    await expectAsync(google.finish(`${ORIGIN}/login?error=access_denied&state=s`)).toBeRejectedWithError('access_denied');
  });

  // En un equipo compartido, si la sesión de Auth0 sobrevive, «Continuar con Google» entraría como la persona anterior.
  it('tras entrar con Google, signOut cierra también la sesión de Auth0', async () => {
    await google.finish(`${ORIGIN}/login?code=c&state=s`);
    expect(google.signOut()).toBeTrue();
    await flush();
    expect(client.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: `${ORIGIN}/login` } });
  });

  it('con contraseña, signOut no pasa por Auth0', async () => {
    expect(google.signOut()).toBeFalse();
    await flush();
    expect(client.logout).not.toHaveBeenCalled();
  });

  it('forget olvida la entrada con Google tras un canje rechazado', async () => {
    await google.finish(`${ORIGIN}/login?code=c&state=s`);
    google.forget();
    expect(google.signOut()).toBeFalse();
  });
});
