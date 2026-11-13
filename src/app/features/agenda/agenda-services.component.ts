import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AgendaServiceType } from '../../core/models/agenda.models';
import { EquipmentModality } from '../../core/models/facility.models';
import { MODALITY_LABELS } from '../../core/models/labels';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { ServiceTypeDialogComponent, ServiceTypeDialogData } from './service-type.dialog';

/** Catálogo de lo que se puede agendar: nombre, modalidad, duración e indicaciones. */
@Component({
  selector: 'app-agenda-services',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="top">
      <p>Lo que se puede agendar. La modalidad decide en qué equipos cabe y la duración, cuánto ocupa cada cita.</p>
      <button mat-flat-button color="primary" (click)="edit()"><mat-icon>add</mat-icon> Agregar servicio</button>
    </div>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (loaded() && services().length === 0) {
      <p class="empty">Aún no hay servicios. Agrega el primero para poder agendar.</p>
    }
    <ul class="list">
      @for (service of services(); track service.id) {
        <li>
          <div class="text">
            <strong>{{ service.name }}</strong>
            <span>{{ modality(service) }} · {{ service.durationMinutes }} min</span>
            <p>{{ service.preparation || 'Sin indicaciones para el paciente' }}</p>
          </div>
          <button mat-stroked-button (click)="edit(service)">Editar</button>
          <button mat-button (click)="remove(service)" [attr.aria-label]="'Quitar ' + service.name">Quitar</button>
        </li>
      }
    </ul>
  `,
  styles: [`
    .top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
    .top p { margin: 0; max-width: 70ch; font-size: 14px; color: #475569; }
    .list { list-style: none; margin: 0; padding: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .list:empty { display: none; }
    li { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid #e2e8f0; }
    li:first-child { border-top: 0; }
    .text { flex: 1; min-width: 0; }
    .text strong { display: block; font-size: 15px; }
    .text span { font-size: 13px; color: #475569; }
    .text p { margin: 2px 0 0; font-size: 13px; color: #475569; white-space: pre-line; }
    .empty, .error { font-size: 14px; color: #475569; }
    .error { color: #b91c1c; }
    @media (max-width: 640px) { li { flex-wrap: wrap; } .text { flex-basis: 100%; } }
  `],
})
export class AgendaServicesComponent {
  private readonly api = inject(AgendaApiService);
  private readonly dialog = inject(MatDialog);
  readonly services = signal<AgendaServiceType[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  modality(service: AgendaServiceType): string {
    return MODALITY_LABELS[service.modality as EquipmentModality] ?? service.modality;
  }

  edit(editing?: AgendaServiceType): void {
    this.dialog
      .open<ServiceTypeDialogComponent, ServiceTypeDialogData, AgendaServiceType>(ServiceTypeDialogComponent, { data: { editing }, width: '560px', maxWidth: '100vw' })
      .afterClosed()
      .subscribe((saved) => saved && this.load());
  }

  remove(service: AgendaServiceType): void {
    if (!confirm(`¿Quitar «${service.name}» del catálogo? Las citas ya agendadas con él se conservan.`)) return;
    this.api.removeServiceType(service.id).subscribe({ next: () => this.load(), error: (err: HttpErrorResponse) => this.error.set(apiMessage(err)) });
  }

  private load(): void {
    this.api.serviceTypes().subscribe({
      next: (services) => {
        this.services.set(services);
        this.loaded.set(true);
        this.error.set(null);
      },
      error: () => this.error.set('No pudimos cargar los servicios. Vuelve a cargar la página.'),
    });
  }
}
