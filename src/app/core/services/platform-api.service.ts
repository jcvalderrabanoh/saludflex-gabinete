import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccountDetail, AccountSummary, AppKey, CatalogApp } from '../models/platform.models';

/** Cliente de la consola de plataforma. Solo responde a los correos autorizados. */
@Injectable({ providedIn: 'root' })
export class PlatformApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/internal/platform`;

  /** `true` si quien está en sesión es admin de plataforma. */
  isPlatformAdmin(): Observable<boolean> {
    return this.http.get(`${this.base}/me`).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  catalog(): Observable<CatalogApp[]> {
    return this.http.get<CatalogApp[]>(`${this.base}/catalog`);
  }

  search(q: string): Observable<AccountSummary[]> {
    return this.http.get<AccountSummary[]>(`${this.base}/accounts`, { params: { q } });
  }

  account(id: string): Observable<AccountDetail> {
    return this.http.get<AccountDetail>(`${this.base}/accounts/${id}`);
  }

  createAccount(input: {
    name: string;
    owner: { firstName: string; lastName: string; email: string; phone?: string };
    apps: AppKey[];
    sendInvitation: boolean;
  }): Observable<{ accountId: string; invited: boolean; account: AccountDetail }> {
    return this.http.post<{ accountId: string; invited: boolean; account: AccountDetail }>(`${this.base}/accounts`, input);
  }

  enableApp(accountId: string, app: AppKey, userIds: string[]): Observable<AccountDetail> {
    return this.http.post<AccountDetail>(`${this.base}/accounts/${accountId}/apps`, {
      app,
      ...(userIds.length ? { userIds } : {}),
    });
  }

  disableApp(accountId: string, app: AppKey): Observable<AccountDetail> {
    return this.http.delete<AccountDetail>(`${this.base}/accounts/${accountId}/apps/${app}`);
  }

  setPermissions(accountId: string, userId: string, app: AppKey, permissions: string[]): Observable<AccountDetail> {
    return this.http.put<AccountDetail>(`${this.base}/accounts/${accountId}/users/${userId}/permissions`, { app, permissions });
  }

  inviteUser(
    accountId: string,
    input: { firstName: string; lastName: string; email: string; role: 'admin' | 'staff'; productPermissions: string[] },
  ): Observable<{ userId: string; invited: boolean; account: AccountDetail }> {
    return this.http.post<{ userId: string; invited: boolean; account: AccountDetail }>(`${this.base}/accounts/${accountId}/users`, input);
  }

  resendInvitation(accountId: string, userId: string): Observable<{ invited: boolean }> {
    return this.http.post<{ invited: boolean }>(`${this.base}/accounts/${accountId}/users/${userId}/invitation`, {});
  }
}
