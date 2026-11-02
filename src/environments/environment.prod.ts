export const environment = {
  production: true,
  // Misma API que lumen-view (core-front): jc-core en producción.
  apiUrl: 'https://core.lumen-view.com',
  /**
   * Auth0 (login con Google). Ver `environment.ts`. PROD -> la Application
   * de LumenView: su «Allowed Callback URLs» y «Allowed Logout URLs» deben
   * incluir https://gabinete.salud-flex.com/login, y «Allowed Web Origins»
   * https://gabinete.salud-flex.com.
   */
  auth0: {
    domain: 'dev-6sdp03y5drfk5w1y.us.auth0.com',
    clientId: 'VwpqF89tU2sFUUkOcrGTlHg0W9YcDKss',
    audience: 'https://core.lumen-view.com',
  },
};
