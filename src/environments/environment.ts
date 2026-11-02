export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  /**
   * Auth0 (login con Google). Valores PÚBLICOS: viajan en el navegador (SPA
   * con PKCE). Tenant compartido con LumenView y SIRA; se separa por Application.
   * LOCAL -> Application `lumen-view-local`: su «Allowed Callback URLs» y
   * «Allowed Logout URLs» deben incluir http://localhost:4200/login.
   */
  auth0: {
    domain: 'dev-6sdp03y5drfk5w1y.us.auth0.com',
    clientId: 'xjagWTreiUBDphvztSxhWJTpBOJP9jhD',
    audience: 'https://core.lumen-view.com',
  },
};
