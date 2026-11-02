import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/select-account', '/auth/auth0/exchange'];

/** Adjunta el token y, ante un 401, renueva la sesión una vez. */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private refreshing = false;
  private readonly refreshed = new BehaviorSubject<string | null>(null);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (AUTH_PATHS.some((path) => request.url.endsWith(path))) return next.handle(request);
    const token = this.authService.getToken();
    const authorized = token ? withToken(request, token) : request;

    return next.handle(authorized).pipe(
      catchError((error) =>
        error instanceof HttpErrorResponse && error.status === 401 && this.authService.getRefreshToken()
          ? this.refreshAndRetry(request, next)
          : throwError(() => error),
      ),
    );
  }

  private refreshAndRetry(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (this.refreshing) {
      return this.refreshed.pipe(
        filter((token): token is string => token !== null),
        take(1),
        switchMap((token) => next.handle(withToken(request, token))),
      );
    }
    this.refreshing = true;
    this.refreshed.next(null);
    return this.authService.refreshToken().pipe(
      switchMap((token) => {
        this.refreshing = false;
        this.refreshed.next(token);
        return next.handle(withToken(request, token));
      }),
      catchError((error) => {
        this.refreshing = false;
        this.authService.clearSession();
        this.router.navigate(['/login']);
        return throwError(() => error);
      }),
    );
  }
}

function withToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
