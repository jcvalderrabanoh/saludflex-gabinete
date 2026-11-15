import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Equipment, EquipmentIncident, EquipmentOperationalStatus, EquipmentType, IncidentResult } from '../../core/models/facility.models';
import { MODALITY_LABELS, OPERATIONAL_STATUS_LABELS } from '../../core/models/labels';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { CanDirective } from '../../shared/directives/can.directive';
import { CloseIncidentData, CloseIncidentDialogComponent } from './close-incident.dialog';
import { maintenanceRows, typeOfEquipment } from './equipment-catalog.helpers';
import { INCIDENT_IMPACT_LABELS, closeNotices, incidentState } from './incident.helpers';
import { ReportIncidentData, ReportIncidentDialogComponent } from './report-incident.dialog';

export interface EquipmentDetailData {
  equipment: Equipment;
  /** Tipos del catálogo; `null` si no se pudo cargar. */
  types: EquipmentType[] | null;
  /** Hoy en el establecimiento (AAAA-MM-DD). */
  today: string;
}

/** Ficha del equipo, los mantenimientos que su tipo sugiere y sus correctivos. Al cerrar devuelve `true` si algo cambió. */
@Component({
  selector: 'app-equipment-detail-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, CanDirective],
  template: `
    <h2 mat-dialog-title>{{ e.name }}</h2>
    <mat-dialog-content>
      <dl class="sheet">
        <dt>Tipo</dt><dd>{{ resolved()?.byModality === false ? resolved()?.type?.name : 'Sin tipo' }}</dd>
        <dt>Modalidad</dt><dd>{{ modality }}</dd>
        <dt>Estado</dt><dd><span class="status" [class]="'status ' + status()">{{ statusLabel() }}</span></dd>
        <dt>Registro sanitario</dt><dd>{{ e.sanitaryRegistration || '—' }}</dd>
        <dt>Proveedor de servicio</dt><dd>{{ e.serviceProvider || '—' }}</dd>
        <dt>Instalado el</dt><dd>{{ e.installedOn || '—' }}</dd>
        <dt>Garantía hasta</dt><dd>{{ e.warrantyUntil || '—' }}</dd>
      </dl>

      <h3>Mantenimientos</h3>
      @if (data.types === null) {
        <p class="hint" role="status">No pudimos cargar los mantenimientos de su tipo. Vuelve a abrir la ficha en un momento.</p>
      } @else if (!resolved()) {
        <p class="hint">Elige su tipo de equipo (en «Editar») para ver los mantenimientos que le corresponden.</p>
      } @else {
        @if (resolved()?.byModality) {
          <p class="hint" role="status">Sin tipo elegido: se muestran los de «{{ resolved()?.type?.name }}» por su modalidad. Elige su tipo en «Editar» si es otro.</p>
        }
        <ul class="list">
          @for (m of rows(); track $index) {
            <li data-testid="maintenance">
              <div class="row-head">
                <span class="title">{{ m.title }}</span>
                <span class="tag" [class.watched]="m.tracked">{{ m.tag }}</span>
              </div>
              <div class="meta">
                {{ m.period }}@if (m.afterRepair) { · {{ m.afterRepair }}} · {{ m.performer }}
              </div>
              <div class="basis" [class.norm]="m.norm">{{ m.basis }}</div>
              <p class="note">{{ m.note }}</p>
            </li>
          }
        </ul>
        <p class="hint">Lo marcado como «Fabricante» o «Planeación» es un valor sugerido: ajústalo al manual del equipo o al contrato del proveedor.</p>
      }

      <div class="section-head">
        <h3>Correctivos</h3>
        <button *appCan="'manage'" mat-stroked-button (click)="report()"><mat-icon>report_problem</mat-icon> Reportar falla</button>
      </div>
      @for (notice of notices(); track notice) { <p class="notice" role="status"><mat-icon>info</mat-icon> {{ notice }}</p> }
      @if (incidentsFailed()) {
        <p class="hint" role="status">No pudimos cargar los correctivos. Vuelve a abrir la ficha en un momento.</p>
      } @else if (incidents()?.length === 0) {
        <p class="hint">Sin correctivos registrados.</p>
      } @else {
        <ul class="list">
          @for (i of incidents(); track i.id) {
            <li data-testid="incident" [class.open]="i.state === 'open'">
              <div class="row-head">
                <span class="state"><mat-icon aria-hidden="true">{{ stateOf(i).icon }}</mat-icon> {{ stateOf(i).label }}</span>
                <span class="meta">Falla del {{ i.reportedOn }} · {{ impactLabel(i) }}</span>
              </div>
              <p class="description">{{ i.description }}</p>
              @if (i.state === 'closed') {
                <p class="meta">Reparado el {{ i.closedOn }}: {{ i.resolution }}@if (i.performedBy) { · {{ i.performedBy }} }</p>
              } @else {
                <div *appCan="'manage'" class="row-actions">
                  <button mat-button color="primary" data-testid="close-incident" (click)="close(i)">Cerrar reparación</button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button (click)="done()">Cerrar</button></mat-dialog-actions>
  `,
  styles: [`
    .sheet { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 14px; margin: 4px 0 16px; }
    dt { color: #64748b; } dd { margin: 0; }
    h3 { font-size: 15px; color: #1e3a8a; margin: 8px 0; }
    .list { list-style: none; padding: 0; margin: 0; }
    li { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
    .row-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .title { font-weight: 600; }
    .tag { font-size: 11px; border-radius: 8px; padding: 1px 8px; background: #fef3c7; color: #92400e; white-space: nowrap; }
    .tag.watched { background: #e0ecff; color: #1e3a8a; }
    .meta { font-size: 13px; color: #334155; margin-top: 4px; }
    .basis { font-size: 12px; color: #64748b; margin-top: 4px; }
    .basis.norm { color: #1e3a8a; font-weight: 600; }
    .note { font-size: 12px; color: #64748b; margin: 4px 0 0; }
    .hint { font-size: 12px; color: #64748b; }
    .status { font-size: 12px; border-radius: 8px; padding: 1px 8px; background: #dcfce7; color: #166534; }
    .status.restricted { background: #fef3c7; color: #92400e; }
    .status.down { background: #fee2e2; color: #991b1b; }
    .section-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px; }
    li.open { border-color: #fcd34d; }
    .state { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 13px; }
    .state mat-icon, .notice mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .description { margin: 4px 0 0; font-size: 14px; }
    .row-actions { display: flex; justify-content: flex-end; }
    .notice { display: flex; align-items: center; gap: 6px; font-size: 13px; background: #eff6ff; color: #1e3a8a; border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
  `],
})
export class EquipmentDetailDialogComponent {
  readonly data = inject<EquipmentDetailData>(MAT_DIALOG_DATA);
  readonly e = this.data.equipment;
  readonly modality = MODALITY_LABELS[this.e.modality] ?? this.e.modality;
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef<EquipmentDetailDialogComponent, boolean>);
  readonly status = signal<EquipmentOperationalStatus>(this.e.operationalStatus ?? 'operating');
  readonly statusLabel = computed(() => OPERATIONAL_STATUS_LABELS[this.status()]);
  readonly incidents = signal<EquipmentIncident[] | null>(null);
  readonly incidentsFailed = signal(false);
  readonly notices = signal<string[]>([]);
  private changed = false;
  readonly resolved = computed(() => (this.data.types ? typeOfEquipment(this.e, this.data.types) : null));
  readonly rows = computed(() => {
    const resolved = this.resolved();
    return resolved ? maintenanceRows(resolved.type) : [];
  });

  constructor() {
    this.loadIncidents();
  }

  private loadIncidents(): void {
    this.api.equipmentIncidents(this.e.id).subscribe({
      next: (list) => {
        this.incidentsFailed.set(false);
        this.incidents.set(list);
      },
      error: () => this.incidentsFailed.set(true),
    });
  }

  stateOf(incident: EquipmentIncident) {
    return incidentState(incident);
  }

  impactLabel(incident: EquipmentIncident): string {
    return INCIDENT_IMPACT_LABELS[incident.impact] ?? incident.impact;
  }

  report(): void {
    const data: ReportIncidentData = { equipmentId: this.e.id, equipmentName: this.e.name, today: this.data.today };
    this.dialog
      .open(ReportIncidentDialogComponent, { width: '520px', data })
      .afterClosed()
      .subscribe((result?: IncidentResult) => this.applied(result, []));
  }

  close(incident: EquipmentIncident): void {
    const data: CloseIncidentData = { incident, today: this.data.today };
    this.dialog
      .open(CloseIncidentDialogComponent, { width: '520px', data })
      .afterClosed()
      .subscribe((result?: IncidentResult) => this.applied(result, result ? closeNotices(result) : []));
  }

  /** Tras reportar o cerrar: el estado que dejó el backend, la lista al día y los avisos. */
  private applied(result: IncidentResult | undefined, notices: string[]): void {
    if (!result) return;
    this.changed = true;
    this.status.set(result.operationalStatus);
    this.notices.set(notices);
    this.loadIncidents();
  }

  done(): void {
    this.ref.close(this.changed);
  }
}
