import { Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, filter, tap } from 'rxjs';
import { AgendaResource, AgendaServiceType } from '../../core/models/agenda.models';
import { PermissionsService } from '../../core/services/permissions.service';
import { AgendaEquipmentData, AgendaEquipmentDialogComponent, AgendaEquipmentResult } from './agenda-equipment.dialog';
import { ServiceTypeDialogComponent, ServiceTypeDialogData } from './service-type.dialog';

type EquipmentRef = Pick<AgendaResource, 'id' | 'name' | 'modality' | 'room'>;
type PlaceRef = Pick<AgendaResource, 'establishmentId' | 'name' | 'modality'>;

const SAVED_FOR_MS = 6_000;
const NEEDS_ACTION_FOR_MS = 12_000;

/** Lo que se dice al guardar un equipo desde la agenda. */
export function equipmentSavedMessage(result: AgendaEquipmentResult): string {
  if (!result.created) return `${result.name} guardado.`;
  if (!result.hoursSaved) {
    return `${result.name} agregado, pero su horario no se guardó. Captúralo en «Configurar agenda» › «Horarios y bloqueos» para poder agendar en él.`;
  }
  const obligations = result.activated === 1 ? 'Se activó 1 obligación; revísala en «Hoy».' : `Se activaron ${result.activated} obligaciones; revísalas en «Hoy».`;
  return `${result.name} agregado: ya se puede agendar en él.${result.activated > 0 ? ` ${obligations}` : ''}`;
}

/**
 * Agregar y editar desde la agenda lo que hace falta para agendar (servicios y equipos),
 * sin mandar a otra pantalla. Cada flujo emite solo si se guardó.
 */
@Injectable({ providedIn: 'root' })
export class AgendaCatalogService {
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly permissions = inject(PermissionsService);
  private readonly savedCount = signal(0);
  /** Cuenta cada servicio o equipo guardado: quien muestra la agenda la vuelve a leer al cambiar. */
  readonly saved = this.savedCount.asReadonly();

  /** jc-core pide `facility.schedule.configure` para el catálogo de servicios. */
  canEditServices(): boolean {
    return this.permissions.can('agendaConfigure');
  }

  /** El alta del equipo pide `facility.manage` y su horario `facility.schedule.configure`: van juntos. */
  canEditEquipment(): boolean {
    return this.permissions.can('manage') && this.permissions.can('agendaConfigure');
  }

  addService(establishmentId: string, equipment: PlaceRef[], modality?: string): Observable<AgendaServiceType> {
    return this.openService({ equipment, establishmentId, ...(modality ? { modality } : {}) });
  }

  editService(editing: AgendaServiceType, establishmentId: string, equipment: PlaceRef[]): Observable<AgendaServiceType> {
    return this.openService({ editing, equipment, establishmentId });
  }

  addEquipment(establishmentId: string, modality?: string): Observable<AgendaEquipmentResult> {
    return this.openEquipment({ establishmentId, ...(modality ? { modality } : {}) });
  }

  editEquipment(establishmentId: string, editing: EquipmentRef): Observable<AgendaEquipmentResult> {
    return this.openEquipment({ establishmentId, editing });
  }

  private openService(data: ServiceTypeDialogData): Observable<AgendaServiceType> {
    return this.dialog
      .open<ServiceTypeDialogComponent, ServiceTypeDialogData, AgendaServiceType>(ServiceTypeDialogComponent, { data, width: '560px', maxWidth: '100vw' })
      .afterClosed()
      .pipe(
        filter((saved): saved is AgendaServiceType => !!saved),
        tap(() => this.savedCount.update((n) => n + 1)),
      );
  }

  private openEquipment(data: AgendaEquipmentData): Observable<AgendaEquipmentResult> {
    return this.dialog
      .open<AgendaEquipmentDialogComponent, AgendaEquipmentData, AgendaEquipmentResult>(AgendaEquipmentDialogComponent, { data, width: '600px', maxWidth: '100vw' })
      .afterClosed()
      .pipe(
        filter((result): result is AgendaEquipmentResult => !!result),
        tap(() => this.savedCount.update((n) => n + 1)),
        tap((result) => this.snack.open(equipmentSavedMessage(result), 'OK', { duration: result.hoursSaved ? SAVED_FOR_MS : NEEDS_ACTION_FOR_MS })),
      );
  }
}
