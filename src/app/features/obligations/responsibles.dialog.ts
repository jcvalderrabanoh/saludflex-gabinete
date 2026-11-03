import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { EvaluatedObligation, ObligationResponsible, TeamMember } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { can } from '../../core/services/permissions.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

/** Tope del backend (`ArrayMaxSize(10)` en `responsibleUserIds`). */
export const MAX_RESPONSIBLES = 10;

export interface ResponsiblesData {
  obligation: EvaluatedObligation;
}

/** Quien puede ser responsable: puede capturar (global o asignado) y no está dado de baja. */
export function eligibleResponsibles(team: readonly TeamMember[]): TeamMember[] {
  return team.filter((m) => m.status !== 'inactive' && can(m.permissions, 'record'));
}

/** Asignar responsables de una obligación: les llegan los avisos y ven la obligación en «Mis pendientes». */
@Component({
  selector: 'app-responsibles-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatListModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Responsables</h2>
    <mat-dialog-content>
      <p class="what"><strong>{{ data.obligation.title }}</strong>@if (data.obligation.subjectLabel) { · {{ data.obligation.subjectLabel }} }</p>
      <p class="hint">A quien elijas le llegan los avisos de vencimiento y ve esta obligación en «Mis pendientes». Puedes elegir hasta {{ max }}.</p>
      @if (dropped().length > 0) {
        <p class="invalid" role="status">
          <strong>Responsable inválido:</strong> {{ droppedNames() }}. Ya no puede capturar o salió del equipo; se quita al guardar.
        </p>
      }
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (options().length === 0) {
        <p class="empty">Nadie del equipo puede registrar evidencia todavía. Invita a alguien en «Equipo» como coordinador o responsable y vuelve aquí.</p>
      } @else {
        <mat-selection-list aria-label="Personas que pueden capturar">
          @for (m of options(); track m.id) {
            <mat-list-option
              togglePosition="before"
              [selected]="selected().includes(m.id)"
              [disabled]="!selected().includes(m.id) && selected().length >= max"
              (selectedChange)="toggle(m.id, $event)"
            >
              <span matListItemTitle>{{ m.name }}</span>
              <span matListItemLine>{{ m.email }}{{ m.status === 'invited' ? ' · invitación pendiente' : '' }}</span>
            </mat-list-option>
          }
        </mat-selection-list>
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="loading() || saving()">
        {{ saving() ? 'Guardando…' : 'Guardar responsables' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .what { margin: 0 0 4px; } .hint { margin: 0 0 8px; color: #6b7684; font-size: 14px; }
    .invalid { font-size: 14px; background: #fff3d6; color: #805800; border-radius: 8px; padding: 8px 12px; margin: 0 0 8px; }
    .empty { color: #3c4757; font-size: 14px; }
    .error { color: #b4232c; font-size: 14px; }
  `],
})
export class ResponsiblesDialogComponent implements OnInit {
  readonly data = inject<ResponsiblesData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ResponsiblesDialogComponent, boolean>);
  private readonly api = inject(FacilityApiService);
  readonly max = MAX_RESPONSIBLES;
  readonly options = signal<TeamMember[]>([]);
  readonly selected = signal<string[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /** Los responsables actuales que ya no se pueden elegir (inválidos o fuera del equipo). */
  readonly dropped = computed<ObligationResponsible[]>(() => {
    if (this.loading()) return [];
    const eligible = new Set(this.options().map((m) => m.id));
    const known = this.data.obligation.responsibles ?? [];
    return this.data.obligation.responsibleUserIds
      .filter((id) => !eligible.has(id))
      .map((id) => known.find((r) => r.id === id) ?? { id, name: 'Usuario sin acceso', valid: false });
  });
  readonly droppedNames = computed(() => this.dropped().map((r) => r.name).join(', '));

  ngOnInit(): void {
    this.api.team().subscribe({
      next: (team) => {
        const eligible = eligibleResponsibles(team);
        const ids = new Set(eligible.map((m) => m.id));
        this.options.set(eligible);
        this.selected.set(this.data.obligation.responsibleUserIds.filter((id) => ids.has(id)).slice(0, MAX_RESPONSIBLES));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No pudimos cargar el equipo. Revisa tu conexión, cierra y vuelve a abrir «Responsables».');
      },
    });
  }

  toggle(id: string, on: boolean): void {
    this.selected.update((list) => {
      if (!on) return list.filter((x) => x !== id);
      if (list.includes(id) || list.length >= MAX_RESPONSIBLES) return list;
      return [...list, id];
    });
  }

  save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.api.setResponsibles(this.data.obligation.id, this.selected()).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
