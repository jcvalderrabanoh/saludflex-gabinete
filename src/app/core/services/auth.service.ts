import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AccountSelectionData,
  AuthResponse,
  SessionData,
  User,
  isAccountSelection,
} from '../../shared/interfaces/user.interface';

/** Resultado de un intento de login: sesión lista o elegir cuenta. */
export type LoginOutcome =
  | { kind: 'session' }
  | { kind: 'select-account'; selection: AccountSelectionData };

export const FACILITY_APP = 'facility' as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly currentUserSubject = new BehaviorSubject<User | null>(readUser());
  readonly currentUser$ = this.currentUserSubject.asObservable();

  login(email: string, password: string): Observable<LoginOutcome> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password, app: FACILITY_APP })
      .pipe(map((response) => this.outcome(response)));
  }

  selectAccount(selectionToken: string, accountId: string): Observable<LoginOutcome> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/select-account`, { selectionToken, accountId })
      .pipe(map((response) => this.outcome(response)));
  }

  refreshToken(): Observable<string> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/refresh`, { refreshToken: this.getRefreshToken() })
      .pipe(
        tap((response) => this.outcome(response)),
        map(() => this.getToken() as string),
      );
  }

  /** Cierra la sesión local y avisa al backend sin esperar respuesta. */
  logout(): void {
    const token = this.getToken();
    if (token) {
      this.http
        .post(`${this.apiUrl}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } })
        .subscribe({ error: () => undefined });
    }
    this.clearSession();
  }

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  hasPermission(permission: string): boolean {
    return (this.getCurrentUser()?.permissions ?? []).includes(permission);
  }

  clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  private outcome(response: AuthResponse): LoginOutcome {
    if (!response.success) throw new Error(response.message || 'No se pudo iniciar sesión');
    if (isAccountSelection(response.data)) {
      return { kind: 'select-account', selection: response.data };
    }
    this.setSession(response.data);
    return { kind: 'session' };
  }

  private setSession(data: SessionData): void {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    if (data.user) {
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      this.currentUserSubject.next(data.user);
    }
  }
}

function readUser(): User | null {
  try {
    const raw = localStorage.getItem('currentUser');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
