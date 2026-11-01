/** Tipos de la consola de plataforma (`/internal/platform` de jc-core). */
export type AppKey = 'lumen-view' | 'facility' | 'anesthesia' | 'attendance';

export interface CatalogApp {
  app: AppKey;
  label: string;
  permissions: string[];
}

export interface AccountSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  apps: AppKey[];
  userCount: number;
}

export interface AccountUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  permissions: string[];
}

export interface AccountDetail {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  apps: { app: AppKey; status: string; trialEndsAt: string | null }[];
  users: AccountUser[];
  history?: { actorEmail: string; action: string; details: Record<string, unknown>; createdAt: string }[];
}

export const PERMISSION_LABELS: Record<string, string> = {
  'facility.read': 'Ver',
  'facility.record': 'Registrar evidencia',
  'facility.manage': 'Configurar',
  'facility.inspect': 'Carpeta de inspección',
};

export const ACTION_LABELS: Record<string, string> = {
  'create-account': 'Creó la cuenta',
  'enable-app': 'Contrató una app',
  'disable-app': 'Quitó una app',
  'set-product-permissions': 'Cambió permisos',
  'invite-user': 'Invitó a un usuario',
  'send-invitation': 'Mandó invitación',
};
