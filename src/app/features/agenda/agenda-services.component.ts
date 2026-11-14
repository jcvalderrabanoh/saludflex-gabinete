import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AgendaResource, AgendaServiceType } from '../../core/models/agenda.models';
import { EquipmentModality } from '../../core/models/facility.models';
import { MODALITY_LABELS } from '../../core/models/labels';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { ServicePlace, placeOf } from './settings.helpers';
import { AgendaCatalogService } from './agenda-catalog.service';
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
            @if (place(service); as place) {
              @if (place.ready) {
                <p class="ready"><mat-icon aria-hidden="true">check_circle</mat-icon> Listo para agendar</p>
              } @else {
                <p class="no-place">
                  <mat-icon aria-hidden="true">warning</mat-icon>
                  <span>
                    <strong>Sin dónde agendarse.</strong> {{ place.text }}
                    @if (canEditEquipment) {
                      <button mat-stroked-button type="button" (click)="addEquipment(service)">Agregar equipo de {{ modality(service) }}</button>
                    } @else {
                      Pide a quien administra la agenda que agregue uno.
                    }
                  </span>
                </p>
              }
            }
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
    .text .ready, .text .no-place { display: flex; align-items: flex-start; gap: 6px; margin-top: 6px; white-space: normal; }
    .text .ready { color: #08764e; }
    .text .no-place { padding: 8px 12px; border-radius: 8px; background: #fff3d6; color: #5c4000; }
    .ready mat-icon, .no-place mat-icon { flex: none; font-size: 18px; width: 18px; height: 18px; }
    .no-place mat-icon { color: #805800; }
    .no-place button { display: block; margin-top: 8px; }
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
  private readonly catalog = inject(AgendaCatalogService);
  readonly canEditEquipment = this.catalog.canEditEquipment();

  private readonly context = inject(EstablishmentContextService);
  /** `null` mientras no carguen o si fallan: sin dato no se marca ningún servicio. */
  private readonly resources = signal<AgendaResource[] | null>(null);
  private readonly establishmentId = computed(() => this.context.current()?.id ?? null);
  /** Los equipos del establecimiento elegido en la barra superior. */
  private readonly own = computed(() => this.resources()?.filter((r) => r.establishmentId === this.establishmentId()) ?? null);

  constructor() {
    this.load();
    this.loadResources();
  }

  /** El equipo nuevo trae la modalidad del servicio; al guardarse, el servicio queda listo para agendar. */
  addEquipment(service: AgendaServiceType): void {
    const establishmentId = this.establishmentId();
    if (establishmentId) this.catalog.addEquipment(establishmentId, service.modality).subscribe(() => this.loadResources());
  }

  private loadResources(): void {
    this.api.resources().subscribe({ next: (resources) => this.resources.set(resources), error: () => this.resources.set(null) });
  }

  place(service: AgendaServiceType): ServicePlace | null {
    return placeOf(service.modality, this.resources(), this.establishmentId());
  }

  modality(service: AgendaServiceType): string {
    return MODALITY_LABELS[service.modality as EquipmentModality] ?? service.modality;
  }

  edit(editing?: AgendaServiceType): void {
    this.dialog
      .open<ServiceTypeDialogComponent, ServiceTypeDialogData, AgendaServiceType>(ServiceTypeDialogComponent, { data: this.dialogData(editing), width: '560px', maxWidth: '100vw' })
      .afterClosed()
      .subscribe((saved) => saved && this.load());
  }

  private dialogData(editing?: AgendaServiceType): ServiceTypeDialogData {
    const equipment = this.own();
    const establishmentId = this.establishmentId();
    return equipment && establishmentId ? { editing, equipment, establishmentId } : { editing };
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
