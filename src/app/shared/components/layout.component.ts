import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../core/services/auth.service';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { GoogleSignIn } from '../../core/services/google-sign-in';
import { PlatformApiService } from '../../core/services/platform-api.service';
import { FacilityAction, PermissionsService } from '../../core/services/permissions.service';
import { CanDirective } from '../directives/can.directive';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Sin permiso, el menú no la ofrece (el backend igual la rechazaría). */
  requires?: FacilityAction;
}

interface NavGroup {
  /** Sin nombre, el grupo va solo y separado (Conexiones, al pie). */
  label: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Día a día',
    items: [
      { path: '/operacion/hoy', label: 'Hoy', icon: 'today' },
      { path: '/operacion/calendario', label: 'Calendario', icon: 'calendar_month' },
      { path: '/operacion/documentos', label: 'Documentos', icon: 'upload_file' },
    ],
  },
  {
    label: 'En regla',
    items: [
      { path: '/operacion/obligaciones', label: 'Obligaciones', icon: 'fact_check' },
      { path: '/operacion/municipal', label: 'Municipal', icon: 'account_balance' },
      { path: '/operacion/carpeta', label: 'Carpeta de inspección', icon: 'folder_shared', requires: 'inspect' },
    ],
  },
  {
    label: 'Mi gabinete',
    items: [
      { path: '/operacion/pagos', label: 'Pagos recurrentes', icon: 'event_repeat', requires: 'payments' },
      { path: '/operacion/establecimientos', label: 'Establecimientos', icon: 'apartment' },
      { path: '/operacion/equipos-y-personal', label: 'Equipos y personal', icon: 'groups' },
      { path: '/operacion/equipo', label: 'Accesos', icon: 'group_add', requires: 'manage' },
    ],
  },
  { label: '', items: [{ path: '/operacion/conexiones', label: 'Conexiones', icon: 'hub' }] },
];

/** Debajo de 768 px la barra lateral flota sobre el contenido y se abre con el botón de menú. */
export const MOBILE_QUERY = '(max-width: 767.98px)';

export function visibleNavGroups(can: (action: FacilityAction) => boolean, groups: readonly NavGroup[] = NAV_GROUPS): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.requires || can(item.requires)) }))
    .filter((group) => group.items.length > 0);
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatDividerModule, MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule, MatButtonModule, MatSelectModule, CanDirective],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav [mode]="mobile() ? 'over' : 'side'" [opened]="!mobile() || menuOpen()" (closedStart)="menuOpen.set(false)" class="nav">
        <div class="brand"><span class="dot"></span> Sistema Integral de Gabinete</div>
        <mat-nav-list>
          @for (group of nav(); track group.label) {
            @if (group.label) {
              <h2 class="group">{{ group.label }}</h2>
            } @else {
              <mat-divider />
            }
            @for (item of group.items; track item.path) {
              <a mat-list-item [routerLink]="item.path" routerLinkActive="active">
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          }
          @if (platformAdmin()) {
            <a mat-list-item routerLink="/operacion/plataforma" routerLinkActive="active">
              <mat-icon matListItemIcon>admin_panel_settings</mat-icon>
              <span matListItemTitle>Plataforma</span>
            </a>
          }
        </mat-nav-list>
        <div class="nav-footer">
          <a *appCan="'inspect'" mat-flat-button color="primary" class="folder-btn" routerLink="/operacion/carpeta"><mat-icon>download</mat-icon> Carpeta en 1 clic</a>
          <p>Organiza la evidencia. No emite certificados.</p>
        </div>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="bar">
          @if (mobile()) {
            <button mat-icon-button (click)="menuOpen.set(true)" aria-label="Abrir menú"><mat-icon>menu</mat-icon></button>
          }
          @if (context.establishments().length > 0) {
            <mat-select class="selector" [value]="context.current()?.id" (selectionChange)="context.select($event.value)" aria-label="Establecimiento">
              @for (e of context.establishments(); track e.id) {
                <mat-option [value]="e.id">{{ e.name }}</mat-option>
              }
            </mat-select>
          }
          <span class="spacer"></span>
          <span class="user">{{ auth.getCurrentUser()?.firstName }}</span>
          <button mat-button (click)="logout()">Salir</button>
        </mat-toolbar>
        <main class="content"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .shell { height: 100vh; }
    .nav { width: 248px; border-right: 1px solid #e2e8f0; }
    .nav ::ng-deep .mat-drawer-inner-container { display: flex; flex-direction: column; }
    .nav-footer { margin-top: auto; padding: 16px; }
    .folder-btn { width: 100%; }
    .nav-footer p { font-size: 11px; color: #94a3b8; text-align: center; margin: 8px 0 0; }
    .brand { display: flex; align-items: center; gap: 10px; padding: 20px 16px; font-weight: 700; color: #2563c9; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: #2563c9; }
    .group { margin: 16px 16px 4px; font-size: 12px; line-height: 16px; font-weight: 600; color: #526077; }
    mat-nav-list { padding-top: 0; }
    mat-divider { margin: 12px 0 4px; }
    .active { background: #eef2fb; }
    .bar { background: #fff; border-bottom: 1px solid #e2e8f0; gap: 12px; }
    .selector { max-width: 320px; font-size: 15px; }
    .spacer { flex: 1; }
    .user { font-size: 14px; color: #475569; }
    .content { padding: 24px; max-width: 1180px; }
    @media (max-width: 767.98px) {
      .content { padding: 16px; }
      .bar { gap: 4px; padding: 0 8px; }
      .selector { max-width: 55vw; }
      .user { display: none; }
    }
  `],
})
export class LayoutComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly context = inject(EstablishmentContextService);
  private readonly api = inject(FacilityApiService);
  private readonly router = inject(Router);
  private readonly google = inject(GoogleSignIn);
  private readonly permissions = inject(PermissionsService);
  readonly nav = computed(() => visibleNavGroups((action) => this.permissions.can(action)));
  readonly mobile = toSignal(inject(BreakpointObserver).observe(MOBILE_QUERY).pipe(map((s) => s.matches)), { initialValue: false });
  /** Solo cuenta en móvil: el menú flotante se cierra al navegar. */
  readonly menuOpen = signal(false);
  private readonly platform = inject(PlatformApiService);
  /** «Plataforma» solo aparece para los admins de plataforma (lo decide el backend). */
  readonly platformAdmin = signal(false);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.menuOpen.set(false));
  }

  ngOnInit(): void {
    this.platform.isPlatformAdmin().subscribe((ok) => this.platformAdmin.set(ok));
    this.api.establishments().subscribe({
      next: (list) => {
        this.context.setEstablishments(list);
        if (list.length === 0) this.router.navigate(['/operacion/establecimientos']);
      },
    });
  }

  logout(): void {
    this.auth.logout();
    this.context.clear();
    // Tras entrar con Google, Auth0 cierra su sesión y él mismo regresa a /login.
    if (!this.google.signOut()) this.router.navigate(['/login']);
  }
}
