import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
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

export const NAV_ITEMS = [
  { path: '/operacion/hoy', label: 'Hoy', icon: 'today' },
  { path: '/operacion/obligaciones', label: 'Obligaciones', icon: 'fact_check' },
  { path: '/operacion/equipos-y-personal', label: 'Equipos y personal', icon: 'groups' },
  { path: '/operacion/carpeta', label: 'Carpeta de inspección', icon: 'folder_shared' },
  { path: '/operacion/establecimientos', label: 'Establecimientos', icon: 'apartment' },
] as const;

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule, MatButtonModule, MatSelectModule],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav mode="side" opened class="nav">
        <div class="brand"><span class="dot"></span> Sistema Integral de Gabinete</div>
        <mat-nav-list>
          @for (item of nav; track item.path) {
            <a mat-list-item [routerLink]="item.path" routerLinkActive="active">
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
          @if (platformAdmin()) {
            <a mat-list-item routerLink="/operacion/plataforma" routerLinkActive="active">
              <mat-icon matListItemIcon>admin_panel_settings</mat-icon>
              <span matListItemTitle>Plataforma</span>
            </a>
          }
        </mat-nav-list>
        <div class="nav-footer">
          <a mat-flat-button color="primary" class="folder-btn" routerLink="/operacion/carpeta"><mat-icon>download</mat-icon> Carpeta en 1 clic</a>
          <p>Organiza la evidencia. No emite certificados.</p>
        </div>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="bar">
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
    .active { background: #eef2fb; }
    .bar { background: #fff; border-bottom: 1px solid #e2e8f0; gap: 12px; }
    .selector { max-width: 320px; font-size: 15px; }
    .spacer { flex: 1; }
    .user { font-size: 14px; color: #475569; }
    .content { padding: 24px; max-width: 1180px; }
  `],
})
export class LayoutComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly context = inject(EstablishmentContextService);
  private readonly api = inject(FacilityApiService);
  private readonly router = inject(Router);
  private readonly google = inject(GoogleSignIn);
  readonly nav = NAV_ITEMS;
  private readonly platform = inject(PlatformApiService);
  /** «Plataforma» solo aparece para los admins de plataforma (lo decide el backend). */
  readonly platformAdmin = signal(false);

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
