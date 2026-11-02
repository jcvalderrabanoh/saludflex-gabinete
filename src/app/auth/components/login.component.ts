import { Component, OnInit, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { AuthService, LoginOutcome } from '../../core/services/auth.service';
import { GoogleSignIn } from '../../core/services/google-sign-in';
import { AccountSelectionData } from '../../shared/interfaces/user.interface';

const HOME = '/operacion/hoy';
const GOOGLE_FAILED = 'No se pudo entrar con Google. Intenta de nuevo o entra con tu correo y contraseña.';

/**
 * Entrada al Sistema Integral de Gabinete, con Google (Auth0) o con contraseña.
 * Diseño: pantalla F1 del proyecto de Stitch (ver `docs/pantallas.md`).
 *
 * Google sale de la app y Auth0 regresa a esta misma página con
 * `?code=&state=`: al montarse, la página detecta el regreso y canjea.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="page">
      <main class="main">
        <header class="head">
          <div class="logo" translate="no">
            <svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect x="15" y="4" width="10" height="32" rx="5" fill="#0b7a75" />
              <rect x="4" y="15" width="16" height="10" rx="5" fill="#0b7a75" />
              <path d="M20 20 H27 Q33 20 33 14 V11" stroke="#0b7a75" stroke-width="10" stroke-linecap="round" opacity=".55" />
            </svg>
            <span>SaludFlex</span>
          </div>
          <p class="system">Sistema Integral de Gabinete</p>
          <h1>Entra a tu gabinete</h1>
          <p class="lead">Vigencias, bitácoras y carpeta de inspección de tu clínica.</p>
        </header>

        <section class="card">
          @if (selection(); as sel) {
            <p class="step">Paso 2 de 2 · Elige la cuenta</p>
            <div class="accounts">
              @for (account of sel.accounts; track account.id) {
                <button type="button" class="account" (click)="chooseAccount(sel, account.id)" [disabled]="loading()">
                  <mat-icon aria-hidden="true">apartment</mat-icon>
                  <span>{{ account.name }}</span>
                  <mat-icon aria-hidden="true">chevron_right</mat-icon>
                </button>
              }
            </div>
          } @else {
            <button type="button" class="google" data-google (click)="signInWithGoogle()" [disabled]="loading()">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Continuar con Google
            </button>

            <p class="divider"><span>o</span></p>

            <form [formGroup]="form" (ngSubmit)="submit()">
              <label class="label" for="email">Correo</label>
              <div class="field">
                <mat-icon aria-hidden="true">mail</mat-icon>
                <input id="email" type="email" formControlName="email" autocomplete="username" />
              </div>

              <label class="label" for="password">Contraseña</label>
              <div class="field">
                <mat-icon aria-hidden="true">lock</mat-icon>
                <input id="password" [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
                <button type="button" class="reveal" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                  <mat-icon aria-hidden="true">{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </div>

              <button type="submit" class="submit" [disabled]="form.invalid || loading()">
                @if (loading()) { <mat-spinner diameter="20" /> } @else { Entrar <mat-icon aria-hidden="true">arrow_forward</mat-icon> }
              </button>
            </form>
          }

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
        </section>
      </main>

      <footer class="foot">Gabinete organiza tu evidencia y te avisa de vencimientos; la autoridad sanitaria resuelve cada trámite.</footer>
    </div>
  `,
  styles: [`
    :host { --ink: #0d2427; --muted: #4d6366; --line: #d5e0de; --brand: #0b7a75; --action: #4d7c0f; --action-hover: #3f6a0b; display: block; }
    .page { min-height: 100vh; display: flex; flex-direction: column; background: #f4f7f6; color: var(--ink); }
    .main { flex: 1; width: 100%; max-width: 400px; margin: 0 auto; padding: 56px 16px 32px; box-sizing: border-box; }
    .head { text-align: center; margin-bottom: 24px; }
    .logo { display: inline-flex; align-items: center; gap: 8px; font-family: 'Bricolage Grotesque', Roboto, sans-serif; font-weight: 800; font-size: 26px; letter-spacing: -0.03em; }
    .system { margin: 4px 0 20px; font-size: 14px; color: var(--muted); }
    h1 { margin: 0; font-size: 26px; line-height: 1.2; font-weight: 700; }
    .lead { margin: 6px 0 0; font-size: 16px; line-height: 1.5; color: var(--muted); }
    .card { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 24px; }
    .step { margin: 0 0 16px; text-align: center; font-size: 14px; color: var(--muted); }
    .google { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 46px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: #1f1f1f; font: 500 15px Roboto, sans-serif; cursor: pointer; transition: background-color .15s ease; }
    .google:hover:not(:disabled) { background: #f6f8f8; }
    .divider { display: flex; align-items: center; gap: 12px; margin: 16px 0; font-size: 14px; color: var(--muted); }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .label { display: block; margin: 0 0 6px; font-size: 14px; font-weight: 600; }
    .field { display: flex; align-items: center; gap: 8px; min-height: 46px; padding: 0 4px 0 12px; margin-bottom: 16px; border: 1px solid var(--line); border-radius: 10px; background: #f8faf9; transition: border-color .15s ease; }
    .field:focus-within { border-color: var(--brand); box-shadow: 0 0 0 3px rgb(11 122 117 / .15); }
    .field > mat-icon { color: var(--muted); font-size: 20px; width: 20px; height: 20px; }
    .field input { flex: 1; min-width: 0; height: 44px; border: 0; background: transparent; font: 16px Roboto, sans-serif; color: var(--ink); outline: none; }
    .reveal { display: grid; place-items: center; width: 44px; height: 44px; border: 0; background: transparent; color: var(--muted); border-radius: 8px; cursor: pointer; }
    .submit { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 46px; margin-top: 8px; border: 0; border-radius: 10px; background: var(--action); color: #fff; font: 600 15px Roboto, sans-serif; cursor: pointer; transition: background-color .15s ease; }
    .submit:hover:not(:disabled) { background: var(--action-hover); }
    .submit mat-icon { font-size: 18px; width: 18px; height: 18px; }
    button:disabled { opacity: .6; cursor: not-allowed; }
    button:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }
    .accounts { display: grid; gap: 8px; }
    .account { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: 500 15px Roboto, sans-serif; text-align: left; cursor: pointer; }
    .account span { flex: 1; }
    .account mat-icon { color: var(--brand); }
    .account:hover:not(:disabled) { border-color: var(--brand); background: #dff0ee; }
    .error { margin: 16px 0 0; font-size: 14px; line-height: 1.4; color: #b4232c; }
    .foot { padding: 16px; border-top: 1px solid var(--line); text-align: center; font-size: 13px; line-height: 1.5; color: var(--muted); }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `],
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly google = inject(GoogleSignIn);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selection = signal<AccountSelectionData | null>(null);
  readonly showPassword = signal(false);

  /** El query viene de la ruta: en la primera navegación la barra de direcciones aún muestra la raíz. */
  ngOnInit(): void {
    const url = new URL('/login', window.location.origin);
    const query = this.route.snapshot.queryParamMap;
    for (const key of query.keys) url.searchParams.set(key, query.get(key)!);
    if (this.google.isReturn(url.href)) this.finishGoogle(url.href);
  }

  signInWithGoogle(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.google.start().catch(() => {
      this.loading.set(false);
      this.error.set(GOOGLE_FAILED);
    });
  }

  submit(): void {
    const { email, password } = this.form.getRawValue();
    this.run(this.auth.login(email, password), loginError);
  }

  chooseAccount(selection: AccountSelectionData, accountId: string): void {
    this.run(this.auth.selectAccount(selection.selectionToken, accountId), loginError);
  }

  /** El `code` es de un solo uso: se quita de la URL para que recargar no reintente el canje. */
  private finishGoogle(url: string): void {
    this.location.replaceState('/login');
    this.run(
      from(this.google.finish(url)).pipe(switchMap((token) => this.auth.exchangeGoogle(token))),
      (err) => {
        this.google.forget();
        return googleError(err);
      },
    );
  }

  private run(request: Observable<LoginOutcome>, describe: (err: unknown) => string): void {
    this.loading.set(true);
    this.error.set(null);
    request.subscribe({
      next: (outcome) => {
        this.loading.set(false);
        if (outcome.kind === 'select-account') {
          this.selection.set(outcome.selection);
        } else {
          this.router.navigate([HOME]);
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.selection.set(null);
        this.error.set(describe(err));
      },
    });
  }
}

export function loginError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 401 || err.status === 400) return 'Correo o contraseña incorrectos, o la cuenta no tiene el Sistema Integral de Gabinete.';
    if (err.status === 429) return 'Demasiados intentos. Espera un minuto.';
    if (err.status === 0) return 'No hay conexión con el servidor.';
  }
  return err instanceof Error ? err.message : 'No se pudo iniciar sesión.';
}

/** jc-core explica en `message` por qué rechazó el canje (p. ej. la cuenta no tiene Gabinete). */
export function googleError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No hay conexión con el servidor.';
    const message = (err.error as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message ? message : GOOGLE_FAILED;
  }
  return err instanceof Error && err.message ? err.message : GOOGLE_FAILED;
}
