export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  accountId: string;
  permissions?: string[];
}

export interface LoginDto {
  email: string;
  password: string;
  /** Sesión de la app «operación en regla»: el backend exige el claim `app`. */
  app: 'facility';
  accountId?: string;
}

export interface SessionData {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface AccountChoice {
  id: string;
  name: string;
}

export interface AccountSelectionData {
  requiresAccountSelection: true;
  accounts: AccountChoice[];
  selectionToken: string;
}

export interface AuthResponse {
  success: boolean;
  data: SessionData | AccountSelectionData;
  message: string;
}

export function isAccountSelection(data: AuthResponse['data']): data is AccountSelectionData {
  return (data as AccountSelectionData).requiresAccountSelection === true;
}
