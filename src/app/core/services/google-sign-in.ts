import { Injectable, InjectionToken, inject } from '@angular/core';
import type { Auth0Client } from '@auth0/auth0-spa-js';
import { environment } from '../../../environments/environment';

/** Lo que Gabinete usa del SDK de Auth0. */
type Auth0Port = Pick<Auth0Client, 'loginWithRedirect' | 'handleRedirectCallback' | 'getTokenSilently' | 'logout'>;

interface GoogleAppState {
  returnUrl: string | null;
}

export interface GoogleReturn {
  /** Access token de Auth0 para canjear en jc-core. */
  token: string;
  returnUrl: string | null;
}

const GOOGLE_CONNECTION = 'google-oauth2';
const SIGNED_IN_WITH_GOOGLE_KEY = 'gabinete.google';
const LOGIN_PATH = '/login';

/**
 * El SDK se carga bajo demanda: quien entra con contraseña no lo descarga.
 *
 * Auth0 vuelve a `/login` (no a la raíz): la raíz redirige a una ruta con guard
 * que mandaría al login descartando `?code=&state=`. `memory`: la sesión que
 * manda es la de Gabinete; la de Auth0 solo dura lo que tarda el canje.
 */
export const AUTH0_CLIENT = new InjectionToken<() => Promise<Auth0Port>>('AUTH0_CLIENT', {
  providedIn: 'root',
  factory: () => {
    let client: Promise<Auth0Port> | null = null;
    return () =>
      (client ??= import('@auth0/auth0-spa-js').then(
        ({ Auth0Client }) =>
          new Auth0Client({
            domain: environment.auth0.domain,
            clientId: environment.auth0.clientId,
            cacheLocation: 'memory',
            authorizationParams: {
              redirect_uri: `${window.location.origin}${LOGIN_PATH}`,
              audience: environment.auth0.audience,
              scope: 'openid profile email',
            },
          }),
      ));
  },
});

/**
 * Entrada con Google vía Auth0 (token-exchange, igual que LumenView y SIRA).
 * Auth0 solo dice QUIÉN es; cuentas y permisos los decide jc-core al canjear
 * el token en `/auth/auth0/exchange` con `app: 'facility'`.
 */
@Injectable({ providedIn: 'root' })
export class GoogleSignIn {
  private readonly client = inject(AUTH0_CLIENT);

  /** Va directo al selector de Google; sin `connection`, Auth0 pediría su propia contraseña. */
  async start(returnUrl: string | null): Promise<void> {
    const client = await this.client();
    await client.loginWithRedirect<GoogleAppState>({
      authorizationParams: { connection: GOOGLE_CONNECTION },
      appState: { returnUrl },
    });
  }

  /** Auth0 regresa con `code` o con `error`, siempre junto a `state`. */
  isReturn(url: string): boolean {
    const params = new URL(url).searchParams;
    return params.has('state') && (params.has('code') || params.has('error'));
  }

  /** Lanza si Auth0 rechazó la entrada (p. ej. se canceló en Google). */
  async finish(url: string): Promise<GoogleReturn> {
    const client = await this.client();
    const { appState } = await client.handleRedirectCallback<GoogleAppState>(url);
    const token = await client.getTokenSilently();
    if (!token) throw new Error('Auth0 no entregó un token');
    remember(true);
    return { token, returnUrl: appState?.returnUrl ?? null };
  }

  /** El canje falló: no queda sesión de Gabinete que cerrar después. */
  forget(): void {
    remember(false);
  }

  /**
   * Cierra también la sesión de Auth0: en un equipo compartido, «Continuar con
   * Google» volvería a entrar como la persona anterior sin preguntar.
   * Devuelve `true` si Auth0 va a redirigir al login.
   */
  signOut(): boolean {
    if (!wasRemembered()) return false;
    remember(false);
    void this.client().then((client) => client.logout({ logoutParams: { returnTo: `${window.location.origin}${LOGIN_PATH}` } }));
    return true;
  }
}

/** localStorage puede lanzar (modo privado, cuota): nunca debe romper la app. */
function remember(signedInWithGoogle: boolean): void {
  try {
    if (signedInWithGoogle) localStorage.setItem(SIGNED_IN_WITH_GOOGLE_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_WITH_GOOGLE_KEY);
  } catch {
    // Sin storage no se hace el cierre federado; la sesión de Gabinete sí se cierra.
  }
}

function wasRemembered(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_WITH_GOOGLE_KEY) === '1';
  } catch {
    return false;
  }
}
