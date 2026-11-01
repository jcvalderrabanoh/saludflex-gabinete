import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService, LoginOutcome } from '../../core/services/auth.service';
import { AccountSelectionData } from '../../shared/interfaces/user.interface';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatListModule, MatProgressSpinnerModule],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <div class="brand">
          <span class="dot"></span>
          <div>
            <h1>Sistema Integral de Gabinete</h1>
            <p>de SaludFlex · operación en regla: vigencias, bitácoras y carpeta de inspección</p>
          </div>
        </div>

        @if (selection(); as sel) {
          <h2 class="step">¿Con qué cuenta entras?</h2>
          <mat-action-list>
            @for (account of sel.accounts; track account.id) {
              <button mat-list-item (click)="chooseAccount(sel, account.id)" [disabled]="loading()">{{ account.name }}</button>
            }
          </mat-action-list>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Correo</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="username" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Contraseña</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="current-password" />
            </mat-form-field>
            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }
            <button mat-flat-button color="primary" type="submit" class="full-width" [disabled]="form.invalid || loading()">
              @if (loading()) { <mat-spinner diameter="20" /> } @else { Entrar }
            </button>
          </form>
        }
      </mat-card>
    </div>
  `,
  styles: [`
    .login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f1f5fd; padding: 20px; }
    .login-card { width: 100%; max-width: 420px; padding: 28px; }
    .brand { display: flex; gap: 12px; align-items: center; margin-bottom: 24px; }
    .brand h1 { margin: 0; font-size: 22px; color: #2563c9; }
    .brand p { margin: 2px 0 0; color: #64748b; font-size: 13px; }
    .dot { width: 14px; height: 14px; border-radius: 50%; background: #2563c9; flex: none; }
    .step { font-size: 16px; margin: 0 0 8px; }
    .full-width { width: 100%; }
    .error { color: #b91c1c; font-size: 13px; margin: 0 0 12px; }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selection = signal<AccountSelectionData | null>(null);

  submit(): void {
    const { email, password } = this.form.getRawValue();
    this.run(this.auth.login(email, password));
  }

  chooseAccount(selection: AccountSelectionData, accountId: string): void {
    this.run(this.auth.selectAccount(selection.selectionToken, accountId));
  }

  private run(request: ReturnType<AuthService['login']>): void {
    this.loading.set(true);
    this.error.set(null);
    request.subscribe({
      next: (outcome: LoginOutcome) => {
        this.loading.set(false);
        if (outcome.kind === 'select-account') {
          this.selection.set(outcome.selection);
        } else {
          this.router.navigate(['/operacion/hoy']);
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.selection.set(null);
        this.error.set(loginError(err));
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
