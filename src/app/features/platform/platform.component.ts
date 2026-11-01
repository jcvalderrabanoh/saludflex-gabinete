import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, debounceTime, startWith, switchMap } from 'rxjs';
import {
  ACTION_LABELS,
  AccountDetail,
  AccountSummary,
  AccountUser,
  AppKey,
  CatalogApp,
  PERMISSION_LABELS,
} from '../../core/models/platform.models';
import { PlatformApiService } from '../../core/services/platform-api.service';
import { CreateAccountDialogComponent, EnableAppDialogComponent, InviteUserDialogComponent } from './platform-dialogs';

/** Consola de plataforma: crear cuentas, unirlas a apps y dar permisos. */
@Component({
  selector: 'app-platform',
  standalone: true,
  imports: [FormsModule, DatePipe, MatButtonModule, MatCardModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSnackBarModule],
  template: `
    <div class="head">
      <div>
        <h1>Plataforma</h1>
        <p class="sub">Cuentas de todas las apps de SaludFlex. Cada acción queda en la bitácora.</p>
      </div>
      <button mat-flat-button color="primary" (click)="createAccount()">Crear cuenta</button>
    </div>
    <div class="layout">
      <section class="list">
        <mat-form-field appearance="outline" class="search">
          <mat-label>Buscar cuenta, correo o id</mat-label>
          <input matInput [ngModel]="query()" (ngModelChange)="search$.next($event)" />
        </mat-form-field>
        @for (a of results(); track a.id) {
          <button class="account" [class.selected]="a.id === account()?.id" (click)="open(a.id)">
            <b>{{ a.name }}</b>
            <span>{{ appsLabel(a) }} · {{ a.userCount }} usuarios</span>
          </button>
        }
        @if (results().length === 0) { <p class="muted">Sin resultados.</p> }
      </section>

      <section class="detail">
        @if (account(); as acc) {
          <mat-card class="card">
            <div class="row">
              <div>
                <h2>{{ acc.name }}</h2>
                <p class="muted">Alta {{ acc.createdAt | date: 'mediumDate' }} · {{ acc.id }}</p>
              </div>
              <span class="spacer"></span>
              <button mat-stroked-button (click)="invite(acc)">Invitar usuario</button>
              <button mat-flat-button color="primary" (click)="enableApp(acc)">Unir a una app</button>
            </div>
            <div class="apps">
              @for (a of acc.apps; track a.app) {
                <span class="app">{{ appLabel(a.app) }} <button class="x" (click)="disableApp(acc, a.app)" [attr.aria-label]="'Quitar ' + appLabel(a.app)">×</button></span>
              }
              @if (acc.apps.length === 0) { <span class="muted">Sin apps contratadas.</span> }
            </div>
          </mat-card>

          <mat-card class="card">
            <h3>Usuarios</h3>
            @for (u of acc.users; track u.id) {
              <div class="user">
                <div class="who">
                  <b>{{ u.firstName }} {{ u.lastName }}</b> <span class="muted">{{ u.email }} · {{ u.role === 'admin' ? 'admin' : 'personal' }}</span>
                </div>
                @for (c of productApps(); track c.app) {
                  <div class="perms">
                    <span class="perm-app">{{ c.label }}:</span>
                    @for (p of c.permissions; track p) {
                      <mat-checkbox [checked]="u.permissions.includes(p)" (change)="togglePermission(acc, u, c.app, p, $event.checked)">{{ permLabel(p) }}</mat-checkbox>
                    }
                  </div>
                }
                <button mat-button (click)="resend(acc, u)">Reenviar invitación</button>
              </div>
            }
          </mat-card>

          @if (acc.history?.length) {
            <mat-card class="card">
              <h3>Bitácora</h3>
              @for (h of acc.history; track $index) {
                <p class="log">{{ h.createdAt | date: 'short' }} · {{ actionLabel(h.action) }} · {{ h.actorEmail }}</p>
              }
            </mat-card>
          }
        } @else {
          <p class="muted">Elige una cuenta o crea una nueva.</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; }
    h1 { margin: 0; } .sub { color: #64748b; margin: 4px 0 16px; }
    .layout { display: grid; grid-template-columns: 300px 1fr; gap: 16px; }
    .search { width: 100%; }
    .account { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; text-align: left; border: 1px solid #e2e8f0; background: #fff; border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer; font: inherit; }
    .account.selected { border-color: #2563c9; background: #eff6ff; }
    .account span { font-size: 12px; color: #64748b; }
    .card { padding: 16px 18px; margin-bottom: 12px; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .spacer { flex: 1; } h2 { margin: 0; font-size: 20px; } h3 { margin: 0 0 8px; font-size: 15px; }
    .apps { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .app { background: #eff6ff; color: #1d4ed8; border-radius: 12px; padding: 3px 4px 3px 10px; font-size: 13px; font-weight: 600; }
    .x { border: 0; background: transparent; color: #64748b; cursor: pointer; font-size: 15px; }
    .user { border-top: 1px solid #f1f5f9; padding: 10px 0; }
    .perms { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; font-size: 13px; }
    .perm-app { font-weight: 600; color: #334155; }
    .muted { color: #64748b; font-size: 13px; } .log { margin: 2px 0; font-size: 12px; color: #475569; }
    .who .muted { margin-left: 8px; }
  `],
})
export class PlatformComponent implements OnInit {
  private readonly api = inject(PlatformApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly search$ = new Subject<string>();
  readonly query = signal('');
  readonly results = signal<AccountSummary[]>([]);
  readonly account = signal<AccountDetail | null>(null);
  readonly catalog = signal<CatalogApp[]>([]);
  readonly productApps = computed(() =>
    this.catalog().filter((c) => c.permissions.length && this.account()?.apps.some((a) => a.app === c.app)),
  );

  ngOnInit(): void {
    this.api.catalog().subscribe((c) => this.catalog.set(c));
    this.search$
      .pipe(startWith(''), debounceTime(250), switchMap((q) => { this.query.set(q); return this.api.search(q); }))
      .subscribe((list) => this.results.set(list));
  }

  appLabel(app: AppKey): string {
    return this.catalog().find((c) => c.app === app)?.label ?? app;
  }

  appsLabel(a: AccountSummary): string {
    return a.apps.length ? a.apps.map((x) => this.appLabel(x)).join(', ') : 'sin apps';
  }

  permLabel(p: string): string {
    return PERMISSION_LABELS[p] ?? p.split('.').slice(1).join(' ');
  }

  actionLabel(a: string): string {
    return ACTION_LABELS[a] ?? a;
  }

  open(id: string): void {
    this.api.account(id).subscribe((acc) => this.account.set(acc));
  }

  createAccount(): void {
    this.dialog
      .open(CreateAccountDialogComponent, { data: { catalog: this.catalog() } })
      .afterClosed()
      .subscribe((acc?: AccountDetail) => {
        if (!acc) return;
        this.snack.open(`Cuenta «${acc.name}» creada`, 'OK', { duration: 4000 });
        this.search$.next(this.query());
        this.open(acc.id);
      });
  }

  enableApp(acc: AccountDetail): void {
    this.dialog
      .open(EnableAppDialogComponent, { data: { account: acc, catalog: this.catalog() } })
      .afterClosed()
      .subscribe((updated?: AccountDetail) => updated && this.refresh(acc.id, 'App contratada'));
  }

  invite(acc: AccountDetail): void {
    this.dialog
      .open(InviteUserDialogComponent, { data: { account: acc, catalog: this.catalog() } })
      .afterClosed()
      .subscribe((updated?: AccountDetail) => updated && this.refresh(acc.id, 'Invitación enviada'));
  }

  disableApp(acc: AccountDetail, app: AppKey): void {
    if (!confirm(`¿Quitar ${this.appLabel(app)} a ${acc.name}? No se borra ningún dato.`)) return;
    this.api.disableApp(acc.id, app).subscribe(() => this.refresh(acc.id, 'App quitada'));
  }

  togglePermission(acc: AccountDetail, user: AccountUser, app: AppKey, permission: string, on: boolean): void {
    const ofApp = this.catalog().find((c) => c.app === app)?.permissions ?? [];
    const current = user.permissions.filter((p) => ofApp.includes(p));
    const next = on ? [...new Set([...current, permission])] : current.filter((p) => p !== permission);
    this.api.setPermissions(acc.id, user.id, app, next).subscribe(() => this.refresh(acc.id, 'Permisos actualizados'));
  }

  resend(acc: AccountDetail, user: AccountUser): void {
    this.api.resendInvitation(acc.id, user.id).subscribe((r) =>
      this.snack.open(r.invited ? `Invitación reenviada a ${user.email}` : 'No se pudo mandar el correo', 'OK', { duration: 4000 }),
    );
  }

  private refresh(id: string, message: string): void {
    this.snack.open(message, 'OK', { duration: 3000 });
    this.open(id);
    this.search$.next(this.query());
  }
}
