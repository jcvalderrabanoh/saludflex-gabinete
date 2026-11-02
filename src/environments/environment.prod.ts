export const environment = {
  production: true,
  // Misma API que lumen-view (core-front): jc-core en producción.
  apiUrl: 'https://core.lumen-view.com',
  /**
   * Auth0 (login con Google). Ver `environment.ts`. PROD -> la Application
   * de LumenView: «Allowed Callback URLs», «Allowed Logout URLs» y «Allowed
   * Web Origins» deben incluir https://gabinete.salud-flex.com (el origin).
   */
  auth0: {
    domain: 'dev-6sdp03y5drfk5w1y.us.auth0.com',
    clientId: 'VwpqF89tU2sFUUkOcrGTlHg0W9YcDKss',
    audience: 'https://core.lumen-view.com',
  },
};
