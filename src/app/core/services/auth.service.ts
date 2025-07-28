import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginDto, AuthResponse, User, ApiResponse } from '../../shared/interfaces/user.interface';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
  }

  login(loginDto: LoginDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, loginDto)
      .pipe(
        tap(response => {
          if (response.success) {
            this.setSession(response.data);
          }
        })
      );
  }

  logout(): Observable<ApiResponse<any>> {
    const token = this.getToken();
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      tap(() => {
        this.clearSession();
      })
    );
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap(response => {
          if (response.success) {
            this.setSession(response.data);
          }
        })
      );
  }

  validateToken(): Observable<ApiResponse<any>> {
    const token = this.getToken();
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/auth/validate`, { accessToken: token });
  }

  private setSession(authData: { user: User; accessToken: string; refreshToken: string }): void {
    localStorage.setItem('accessToken', authData.accessToken);
    localStorage.setItem('refreshToken', authData.refreshToken);
    localStorage.setItem('currentUser', JSON.stringify(authData.user));
    this.currentUserSubject.next(authData.user);
  }

  private clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  private loadUserFromStorage(): void {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      const user = JSON.parse(userStr);
      this.currentUserSubject.next(user);
    }
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
}
