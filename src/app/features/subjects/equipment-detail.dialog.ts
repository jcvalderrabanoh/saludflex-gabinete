import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Equipment, EquipmentType } from '../../core/models/facility.models';
import { MODALITY_LABELS, OPERATIONAL_STATUS_LABELS } from '../../core/models/labels';
import { maintenanceRows } from './equipment-catalog.helpers';

export interface EquipmentDetailData {
  equipment: Equipment;
  /** Tipos del catálogo; `null` si no se pudo cargar. */
  types: EquipmentType[] | null;
}

/** Ficha del equipo y los mantenimientos que su tipo sugiere, con la base de cada periodicidad. */
@Component({
  selector: 'app-equipment-detail-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ e.name }}</h2>
    <mat-dialog-content>
      <dl class="sheet">
        <dt>Tipo</dt><dd>{{ type()?.name ?? 'Sin tipo' }}</dd>
        <dt>Modalidad</dt><dd>{{ modality }}</dd>
        <dt>Estado</dt><dd><span class="status" [class]="'status ' + status">{{ statusLabel }}</span></dd>
        <dt>Registro sanitario</dt><dd>{{ e.sanitaryRegistration || '—' }}</dd>
        <dt>Proveedor de servicio</dt><dd>{{ e.serviceProvider || '—' }}</dd>
        <dt>Instalado el</dt><dd>{{ e.installedOn || '—' }}</dd>
        <dt>Garantía hasta</dt><dd>{{ e.warrantyUntil || '—' }}</dd>
      </dl>

      <h3>Mantenimientos</h3>
      @if (data.types === null) {
        <p class="hint" role="status">No pudimos cargar los mantenimientos de su tipo. Vuelve a abrir la ficha en un momento.</p>
      } @else if (!type()) {
        <p class="hint">Elige su tipo de equipo (en «Editar») para ver los mantenimientos que le corresponden.</p>
      } @else {
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
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Cerrar</button></mat-dialog-actions>
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
  `],
})
export class EquipmentDetailDialogComponent {
  readonly data = inject<EquipmentDetailData>(MAT_DIALOG_DATA);
  readonly e = this.data.equipment;
  readonly modality = MODALITY_LABELS[this.e.modality] ?? this.e.modality;
  readonly status = this.e.operationalStatus ?? 'operating';
  readonly statusLabel = OPERATIONAL_STATUS_LABELS[this.status];
  readonly type = computed(() => this.data.types?.find((t) => t.key === this.e.equipmentTypeKey) ?? null);
  readonly rows = computed(() => {
    const type = this.type();
    return type ? maintenanceRows(type) : [];
  });
}
