import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { AgendaHoursComponent } from './agenda-hours.component';
import { AgendaServicesComponent } from './agenda-services.component';

/** Configuración de la agenda: qué se agenda y cuándo trabaja cada equipo. */
@Component({
  selector: 'app-agenda-settings',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTabsModule, AgendaHoursComponent, AgendaServicesComponent],
  template: `
    <header class="head">
      <h1>Configurar agenda</h1>
      <a mat-stroked-button routerLink="/operacion/agenda"><mat-icon>view_week</mat-icon> Ver la agenda</a>
    </header>
    <mat-tab-group animationDuration="0ms">
      <mat-tab label="Servicios"><app-agenda-services /></mat-tab>
      <mat-tab label="Horarios y bloqueos"><ng-template matTabContent><app-agenda-hours /></ng-template></mat-tab>
    </mat-tab-group>
  `,
  styles: [`
    .head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; }
    h1 { margin: 0; }
  `],
})
export class AgendaSettingsComponent {}
