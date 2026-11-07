import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ConnectableApp, ConnectedApp, ConnectedAppState } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';

interface AppCard {
  name: string;
  summary: string;
  icon: string;
  url: string;
}

const APPS: Record<ConnectableApp, AppCard> = {
  'lumen-view': { name: 'lumen-view', summary: 'Imagen médica, informes y entrega de resultados.', icon: 'radiology', url: 'https://app.lumen-view.com' },
  attendance: { name: 'Asistencia', summary: 'Registro de entradas y salidas del personal.', icon: 'schedule', url: 'https://core.lumen-view.com/asistencia/' },
};

const STATE_LABELS: Record<ConnectedAppState, string> = {
  active: 'Contratada',
  trial: 'En prueba',
  trial_expired: 'Prueba vencida',
  not_contracted: 'No contratada',
};

const CONTACT_EMAIL = 'hola@salud-flex.com';

/** Otras apps de la cuenta (F15 en Stitch). Solo enlaza: no comparte sesión ni datos. */
@Component({
  selector: 'app-connections',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <h1>Conexiones</h1>
    <p class="sub">Otras apps de SaludFlex para tu cuenta. Cada una se abre aparte, con su propio acceso.</p>

    @if (error()) { <p class="error" role="alert">No pudimos revisar qué apps tiene tu cuenta. Vuelve a cargar la página.</p> }

    <ul class="list">
      @for (connection of connections(); track connection.app) {
        @let card = cardOf(connection);
        <li class="line">
          <mat-icon class="icon" aria-hidden="true">{{ card.icon }}</mat-icon>
          <div class="text">
            <div class="title">{{ card.name }} <span class="chip" [class.on]="canOpen(connection)">{{ stateLabel(connection) }}</span></div>
            <p>{{ card.summary }}</p>
          </div>
          @if (canOpen(connection)) {
            <a mat-flat-button color="primary" [href]="card.url" target="_blank" rel="noopener noreferrer">Abrir {{ card.name }} <mat-icon iconPositionEnd>open_in_new</mat-icon></a>
          } @else {
            <a mat-stroked-button [href]="contactHref(card)"><mat-icon>mail</mat-icon> Pedir información</a>
          }
        </li>
      }
    </ul>

    <p class="note"><mat-icon aria-hidden="true">info</mat-icon> Aquí no se ven expedientes ni asistencia.</p>
  `,
  styles: [`
    h1 { margin: 0; }
    .sub { margin: 4px 0 16px; color: #475569; font-size: 14px; max-width: 70ch; }
    .list { list-style: none; margin: 0; padding: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .list:empty { display: none; }
    .line { display: flex; align-items: center; gap: 16px; padding: 16px; border-top: 1px solid #e2e8f0; }
    .line:first-child { border-top: 0; }
    .icon { color: #1e3a8a; flex: none; }
    .text { flex: 1; min-width: 0; }
    .title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-weight: 700; font-size: 16px; color: #0f172a; }
    .text p { margin: 2px 0 0; font-size: 14px; color: #475569; }
    .chip { font-size: 12px; font-weight: 600; border-radius: 12px; padding: 2px 10px; background: #e2e8f0; color: #334155; }
    .chip.on { background: #dcfce7; color: #166534; }
    .note { display: flex; align-items: center; gap: 8px; margin-top: 16px; font-size: 14px; color: #475569; }
    .error { color: #b91c1c; font-size: 14px; }
    @media (max-width: 640px) { .line { flex-wrap: wrap; } .line a { width: 100%; } }
  `],
})
export class ConnectionsComponent {
  private readonly api = inject(FacilityApiService);
  readonly connections = signal<ConnectedApp[]>([]);
  readonly error = signal(false);

  constructor() {
    this.api.connectedApps().subscribe({ next: (list) => this.connections.set(list), error: () => this.error.set(true) });
  }

  cardOf(connection: ConnectedApp): AppCard {
    return APPS[connection.app];
  }

  stateLabel(connection: ConnectedApp): string {
    return STATE_LABELS[connection.state];
  }

  /** La prueba vencida sigue activa en BD, pero la app ya no deja entrar. */
  canOpen(connection: ConnectedApp): boolean {
    return connection.state === 'active' || connection.state === 'trial';
  }

  contactHref(card: AppCard): string {
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Información sobre ${card.name}`)}`;
  }
}
