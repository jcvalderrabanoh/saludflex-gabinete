import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { authGuard } from './auth/guards/auth.guard';
import { permissionGuard } from './auth/guards/permission.guard';
import { LoginComponent } from './auth/components/login.component';
import { LayoutComponent } from './shared/components/layout.component';

/**
 * Pantallas de «Operación en regla» (ADR-005 de jc-core). Al añadir o cambiar
 * una ruta, actualiza `docs/pantallas.md`.
 */
export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'operacion',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'hoy', loadComponent: () => import('./features/today/today.component').then((m) => m.TodayComponent) },
      { path: 'documentos', loadComponent: () => import('./features/documents/documents.component').then((m) => m.DocumentsComponent) },
      { path: 'obligaciones', loadComponent: () => import('./features/obligations/obligations.component').then((m) => m.ObligationsComponent) },
      { path: 'calendario', loadComponent: () => import('./features/calendar/calendar.component').then((m) => m.CalendarComponent) },
      { path: 'municipal', loadComponent: () => import('./features/municipal/municipal.component').then((m) => m.MunicipalComponent) },
      { path: 'pagos', canActivate: [permissionGuard('payments')], loadComponent: () => import('./features/payments/payments.component').then((m) => m.PaymentsComponent) },
      { path: 'conexiones', loadComponent: () => import('./features/connections/connections.component').then((m) => m.ConnectionsComponent) },
      { path: 'equipos-y-personal', loadComponent: () => import('./features/subjects/subjects.component').then((m) => m.SubjectsComponent) },
      { path: 'carpeta', canActivate: [permissionGuard('inspect')], loadComponent: () => import('./features/inspection/inspection.component').then((m) => m.InspectionComponent) },
      { path: 'establecimientos', loadComponent: () => import('./features/establishments/establishments.component').then((m) => m.EstablishmentsComponent) },
      { path: 'equipo', canActivate: [permissionGuard('manage')], loadComponent: () => import('./features/team/team.component').then((m) => m.TeamComponent) },
      { path: 'plataforma', loadComponent: () => import('./features/platform/platform.component').then((m) => m.PlatformComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'hoy' },
    ],
  },
  // Auth0 regresa a la raíz (callback que ya usa lumen-view): el regreso se reenvía al login con su código.
  {
    path: '',
    pathMatch: 'full',
    redirectTo: ({ queryParams }) =>
      'state' in queryParams ? inject(Router).createUrlTree(['/login'], { queryParams }) : '/operacion/hoy',
  },
  { path: '**', redirectTo: 'operacion/hoy' },
];
