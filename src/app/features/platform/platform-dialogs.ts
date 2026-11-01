import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AccountDetail, AppKey, CatalogApp, PERMISSION_LABELS } from '../../core/models/platform.models';
import { PlatformApiService } from '../../core/services/platform-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

const COMMON = [ReactiveFormsModule, FormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule];
const STYLES = `
  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; min-width: 520px; }
  .wide { grid-column: 1 / -1; }
  .group { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; margin: 4px 0 12px; }
  .group-title { font-size: 13px; font-weight: 600; color: #334155; }
  .hint { font-size: 12px; color: #64748b; }
  .error { color: #b91c1c; font-size: 13px; }
`;

/** Crear una cuenta nueva (gabinete o clínica) con su dueño. */
@Component({
  selector: 'app-create-account-dialog',
  standalone: true,
  imports: COMMON,
  template: `
    <h2 mat-dialog-title>Crear cuenta</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="wide"><mat-label>Nombre de la cuenta</mat-label><input matInput formControlName="name" placeholder="Clínica San Pablo" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Nombre del dueño</mat-label><input matInput formControlName="firstName" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Apellidos</mat-label><input matInput formControlName="lastName" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Correo del dueño</mat-label><input matInput type="email" formControlName="email" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Teléfono (opcional)</mat-label><input matInput formControlName="phone" placeholder="+52…" /></mat-form-field>
      </form>
      <div class="group">
        <span class="group-title">Apps que contrata</span>
        @for (c of data.catalog; track c.app) {
          <mat-checkbox [checked]="apps().includes(c.app)" (change)="toggle(c.app, $event.checked)">{{ c.label }}</mat-checkbox>
        }
      </div>
      <mat-checkbox [(ngModel)]="sendInvitation">Mandar al dueño el correo para crear su contraseña</mat-checkbox>
      <p class="hint">El dueño queda como administrador con todos los permisos de sus apps.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || apps().length === 0 || saving()">Crear cuenta</button>
    </mat-dialog-actions>
  `,
  styles: [STYLES],
})
export class CreateAccountDialogComponent {
  readonly data = inject<{ catalog: CatalogApp[] }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CreateAccountDialogComponent, AccountDetail>);
  private readonly api = inject(PlatformApiService);
  readonly apps = signal<AppKey[]>(['facility']);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  sendInvitation = true;
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
  });

  toggle(app: AppKey, on: boolean): void {
    this.apps.update((list) => (on ? [...list, app] : list.filter((a) => a !== app)));
  }

  save(): void {
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .createAccount({
        name: v.name,
        owner: { firstName: v.firstName, lastName: v.lastName, email: v.email, ...(v.phone ? { phone: v.phone } : {}) },
        apps: this.apps(),
        sendInvitation: this.sendInvitation,
      })
      .subscribe({
        next: (r) => this.ref.close(r.account),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(apiMessage(err));
        },
      });
  }
}

/** Unir una cuenta existente a una app (p. ej. UDIX al Sistema Integral de Gabinete). */
@Component({
  selector: 'app-enable-app-dialog',
  standalone: true,
  imports: COMMON,
  template: `
    <h2 mat-dialog-title>Unir {{ data.account.name }} a una app</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full">
        <mat-label>App</mat-label>
        <mat-select [(ngModel)]="app">
          @for (c of available(); track c.app) { <mat-option [value]="c.app">{{ c.label }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <div class="group">
        <span class="group-title">¿Quién entra con todos los permisos de la app?</span>
        @for (u of data.account.users; track u.id) {
          <mat-checkbox [checked]="selected().includes(u.id)" (change)="toggle(u.id, $event.checked)">{{ u.firstName }} {{ u.lastName }} · {{ u.email }}{{ u.role === 'admin' ? ' (admin)' : '' }}</mat-checkbox>
        }
        <span class="hint">Si no eliges a nadie, se les dan a los administradores. Después puedes ajustar a cada quien.</span>
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!app || saving()">Unir</button>
    </mat-dialog-actions>
  `,
  styles: [STYLES + ' .full { width: 100%; min-width: 520px; }'],
})
export class EnableAppDialogComponent {
  readonly data = inject<{ account: AccountDetail; catalog: CatalogApp[] }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EnableAppDialogComponent, AccountDetail>);
  private readonly api = inject(PlatformApiService);
  readonly available = computed(() => this.data.catalog.filter((c) => !this.data.account.apps.some((a) => a.app === c.app)));
  app: AppKey | null = this.available().find((c) => c.app === 'facility')?.app ?? this.available()[0]?.app ?? null;
  readonly selected = signal<string[]>(this.data.account.users.filter((u) => u.role === 'admin').map((u) => u.id));
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  toggle(id: string, on: boolean): void {
    this.selected.update((list) => (on ? [...list, id] : list.filter((x) => x !== id)));
  }

  save(): void {
    if (!this.app) return;
    this.saving.set(true);
    this.api.enableApp(this.data.account.id, this.app, this.selected()).subscribe({
      next: (account) => this.ref.close(account),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}

/** Invitar a un usuario nuevo a una cuenta. */
@Component({
  selector: 'app-invite-user-dialog',
  standalone: true,
  imports: COMMON,
  template: `
    <h2 mat-dialog-title>Invitar a {{ data.account.name }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline"><mat-label>Nombre</mat-label><input matInput formControlName="firstName" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Apellidos</mat-label><input matInput formControlName="lastName" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Correo</mat-label><input matInput type="email" formControlName="email" /></mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Rol</mat-label>
          <mat-select formControlName="role"><mat-option value="staff">Personal</mat-option><mat-option value="admin">Administrador</mat-option></mat-select>
        </mat-form-field>
      </form>
      @for (c of enabledCatalog(); track c.app) {
        <div class="group">
          <span class="group-title">{{ c.label }}</span>
          @for (p of c.permissions; track p) {
            <mat-checkbox [checked]="permissions().includes(p)" (change)="toggle(p, $event.checked)">{{ label(p) }}</mat-checkbox>
          }
        </div>
      }
      <p class="hint">Recibe un correo para crear su contraseña.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Invitar</button>
    </mat-dialog-actions>
  `,
  styles: [STYLES],
})
export class InviteUserDialogComponent {
  readonly data = inject<{ account: AccountDetail; catalog: CatalogApp[] }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<InviteUserDialogComponent, AccountDetail>);
  private readonly api = inject(PlatformApiService);
  readonly enabledCatalog = computed(() =>
    this.data.catalog.filter((c) => c.permissions.length && this.data.account.apps.some((a) => a.app === c.app)),
  );
  readonly permissions = signal<string[]>(['facility.read']);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['staff' as 'staff' | 'admin'],
  });

  label(p: string): string {
    return PERMISSION_LABELS[p] ?? p;
  }

  toggle(p: string, on: boolean): void {
    this.permissions.update((list) => (on ? [...list, p] : list.filter((x) => x !== p)));
  }

  save(): void {
    const allowed = this.enabledCatalog().flatMap((c) => c.permissions);
    this.saving.set(true);
    this.api
      .inviteUser(this.data.account.id, { ...this.form.getRawValue(), productPermissions: this.permissions().filter((p) => allowed.includes(p)) })
      .subscribe({
        next: (r) => this.ref.close(r.account),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(apiMessage(err));
        },
      });
  }
}
