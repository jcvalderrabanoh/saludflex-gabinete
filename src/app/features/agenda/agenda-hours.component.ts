import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormGroupDirective, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgendaBlock, AgendaResource } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { AgendaCatalogService } from './agenda-catalog.service';
import { DEFAULT_TIME_ZONE } from './agenda.helpers';
import { instantAt } from './booking.helpers';
import { WeekRow, blockSpan, copyDayToWeek, flattenWeek, weekProblem, weekRows } from './settings.helpers';

const LOCAL_DATE_TIME = /^(20\d{2}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/** Horario semanal y bloqueos de cada equipo del establecimiento. */
@Component({
  selector: 'app-agenda-hours',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    @if (loadError()) { <p class="error" role="alert">No pudimos cargar los equipos. Vuelve a cargar la página.</p> }
    @if (loaded() && own().length === 0) {
      <div class="notice">
        <p>Este establecimiento aún no tiene equipos. El horario y los bloqueos son por equipo.</p>
        @if (canEditEquipment) {
          <button mat-flat-button color="primary" (click)="addEquipment()"><mat-icon>add</mat-icon> Agregar equipo</button>
        } @else {
          <p>Pide a quien administra la agenda que agregue uno.</p>
        }
      </div>
    }
    @if (selected(); as equipment) {
      <div class="equipment-row">
        <mat-form-field appearance="outline" class="equipment">
          <mat-label>Equipo</mat-label>
          <mat-select [value]="equipment.id" (selectionChange)="choose($event.source)">
            @for (resource of own(); track resource.id) {
              <mat-option [value]="resource.id">{{ resource.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (canEditEquipment) {
          <button mat-stroked-button (click)="editEquipment(equipment)"><mat-icon>edit</mat-icon> Editar equipo</button>
          <button mat-stroked-button (click)="addEquipment()"><mat-icon>add</mat-icon> Agregar equipo</button>
        }
      </div>

      <section aria-labelledby="hours-title">
        <h2 id="hours-title">Horario semanal</h2>
        <p class="hint">Horas en que se puede agendar en {{ equipment.name }}. Para cerrar a medianoche escribe 00:00 como cierre. Un día sin tramos queda cerrado.</p>
        <ul class="week">
          @for (row of week(); track row.weekday) {
            <li>
              <strong>{{ row.label }}</strong>
              <div class="intervals">
                @for (interval of row.intervals; track $index) {
                  <div class="interval">
                    <input type="time" [(ngModel)]="interval.opensAt" (ngModelChange)="touch()" [attr.aria-label]="row.label + ', abre'" />
                    <span aria-hidden="true">a</span>
                    <input type="time" [(ngModel)]="interval.closesAt" (ngModelChange)="touch()" [attr.aria-label]="row.label + ', cierra'" />
                    <button mat-icon-button (click)="removeInterval(row, $index)" [attr.aria-label]="'Quitar tramo de ' + row.label"><mat-icon>close</mat-icon></button>
                  </div>
                } @empty {
                  <span class="closed">Cerrado</span>
                }
              </div>
              <button mat-button (click)="addInterval(row)">Agregar tramo</button>
              @if (row.intervals.length > 0) {
                <button mat-button (click)="copy(row)" [attr.aria-label]="'Copiar el horario de ' + row.label + ' a toda la semana'">Copiar a toda la semana</button>
              }
            </li>
          }
        </ul>
        @if (problem()) { <p class="error" role="alert">{{ problem() }}</p> }
        <button mat-flat-button color="primary" (click)="saveHours(equipment)" [disabled]="!dirty() || !!problem() || saving()">{{ saving() ? 'Guardando…' : 'Guardar horario' }}</button>
      </section>

      <section aria-labelledby="blocks-title">
        <h2 id="blocks-title">Bloqueos</h2>
        <p class="hint">Lapsos en que {{ equipment.name }} no se agenda: mantenimiento, falla, obra. Bloquear no mueve las citas que ya estén en ese lapso.</p>
        <form [formGroup]="blockForm" class="block-form" (ngSubmit)="addBlock(equipment)">
          <mat-form-field appearance="outline">
            <mat-label>Desde</mat-label>
            <input matInput type="datetime-local" formControlName="from" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Hasta</mat-label>
            <input matInput type="datetime-local" formControlName="to" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="reason">
            <mat-label>Motivo</mat-label>
            <input matInput formControlName="reason" maxlength="255" />
          </mat-form-field>
          <button mat-stroked-button type="submit" [disabled]="blockForm.invalid || saving()">Bloquear</button>
        </form>
        @if (blockError()) { <p class="error" role="alert">{{ blockError() }}</p> }
        @if (blocks().length === 0) {
          <p class="hint">Sin bloqueos próximos.</p>
        } @else {
          <ul class="blocks">
            @for (block of blocks(); track block.id) {
              <li>
                <span><strong>{{ span(block) }}</strong> · {{ block.reason }}</span>
                <button mat-button (click)="removeBlock(equipment, block)" [attr.aria-label]="'Quitar bloqueo: ' + block.reason">Quitar</button>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: [`
    .equipment-row { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 0 8px; margin-top: 16px; }
    .equipment-row button { margin-top: 8px; min-height: 44px; }
    .equipment { width: min(360px, 100%); }
    h2 { margin: 8px 0 4px; font-size: 18px; }
    section + section { margin-top: 32px; }
    .hint { margin: 0 0 12px; max-width: 70ch; font-size: 14px; color: #475569; }
    .week, .blocks { list-style: none; margin: 0 0 12px; padding: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .week li, .blocks li { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 8px 16px; border-top: 1px solid #e2e8f0; }
    .week li:first-child, .blocks li:first-child { border-top: 0; }
    .week strong { width: 92px; }
    .intervals { flex: 1; display: flex; flex-wrap: wrap; gap: 8px 16px; min-width: 220px; }
    .interval { display: flex; align-items: center; gap: 6px; }
    .interval input { height: 40px; padding: 0 8px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; font-size: 14px; }
    .closed { align-self: center; font-size: 14px; color: #5b6b80; }
    .blocks li { justify-content: space-between; font-size: 14px; }
    .block-form { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 0 12px; }
    .block-form button { margin-top: 8px; }
    .reason { flex: 1; min-width: 200px; }
    .error { margin: 0 0 12px; color: #b91c1c; font-size: 14px; }
    .notice { margin-top: 16px; padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .notice p { margin: 0 0 12px; }
  `],
})
export class AgendaHoursComponent {
  private readonly api = inject(AgendaApiService);
  private readonly context = inject(EstablishmentContextService);
  private readonly snack = inject(MatSnackBar);
  private readonly catalog = inject(AgendaCatalogService);
  readonly canEditEquipment = this.catalog.canEditEquipment();

  private readonly resources = signal<AgendaResource[]>([]);
  readonly loaded = signal(false);
  readonly loadError = signal(false);
  /** Los equipos del establecimiento elegido en la barra superior. */
  readonly own = computed(() => this.resources().filter((resource) => resource.establishmentId === this.context.current()?.id));
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(() => this.own().find((resource) => resource.id === this.selectedId()) ?? this.own()[0] ?? null);
  private readonly timeZone = computed(() => this.context.current()?.timeZone || DEFAULT_TIME_ZONE);

  /** Copia editable del horario del equipo elegido. */
  readonly week = signal<WeekRow[]>([]);
  readonly dirty = signal(false);
  readonly problem = computed(() => weekProblem(this.week()));
  readonly saving = signal(false);
  readonly blocks = signal<AgendaBlock[]>([]);
  readonly blockError = signal<string | null>(null);

  private readonly blockFormDirective = viewChild(FormGroupDirective);
  readonly blockForm = inject(FormBuilder).nonNullable.group({
    from: ['', [Validators.required, Validators.pattern(LOCAL_DATE_TIME)]],
    to: ['', [Validators.required, Validators.pattern(LOCAL_DATE_TIME)]],
    reason: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  constructor() {
    this.loadResources();
    // Solo al cambiar de equipo (su id, no el objeto: guardar el horario lo reemplaza) se cargan su horario y sus bloqueos.
    const equipmentId = computed(() => this.selected()?.id ?? null);
    effect(() => {
      equipmentId();
      untracked(() => {
        const equipment = this.selected();
        this.week.set(weekRows(equipment?.hours ?? []));
        this.dirty.set(false);
        this.blocks.set([]);
        this.blockError.set(null);
        if (equipment) this.loadBlocks(equipment.id);
      });
    });
  }

  /** El equipo nuevo llega con su horario y queda elegido para afinarlo o bloquearlo. */
  addEquipment(): void {
    const establishmentId = this.context.current()?.id;
    if (!establishmentId || !this.confirmDiscard()) return;
    this.catalog.addEquipment(establishmentId).subscribe((result) => this.loadResources(result.equipmentId));
  }

  editEquipment(equipment: AgendaResource): void {
    const establishmentId = this.context.current()?.id;
    if (establishmentId) this.catalog.editEquipment(establishmentId, equipment).subscribe(() => this.loadResources());
  }

  private loadResources(select?: string): void {
    this.api.resources().subscribe({
      next: (resources) => {
        this.resources.set(resources);
        this.loaded.set(true);
        if (select) this.selectedId.set(select);
      },
      error: () => this.loadError.set(true),
    });
  }

  private confirmDiscard(): boolean {
    return !this.dirty() || confirm('El horario tiene cambios sin guardar. ¿Seguir y descartarlos?');
  }

  /** Cambiar de equipo descarta el horario sin guardar: se pregunta antes. */
  choose(select: Pick<MatSelect, 'value'>): void {
    const current = this.selected()?.id;
    if (this.dirty() && !confirm('El horario tiene cambios sin guardar. ¿Cambiar de equipo y descartarlos?')) {
      select.value = current;
      return;
    }
    this.selectedId.set(select.value);
  }

  span(block: AgendaBlock): string {
    return blockSpan(block, this.timeZone());
  }

  /** Los campos de hora editan el renglón en sitio: se avisa a quien depende del horario. */
  touch(): void {
    this.week.update((rows) => [...rows]);
    this.dirty.set(true);
  }

  addInterval(row: WeekRow): void {
    row.intervals.push({ opensAt: '', closesAt: '' });
    this.touch();
  }

  removeInterval(row: WeekRow, index: number): void {
    row.intervals.splice(index, 1);
    this.touch();
  }

  copy(row: WeekRow): void {
    this.week.set(copyDayToWeek(this.week(), row.weekday));
    this.dirty.set(true);
  }

  saveHours(equipment: AgendaResource): void {
    if (this.saving() || this.problem()) return;
    this.saving.set(true);
    this.api.replaceHours(equipment.id, flattenWeek(this.week())).subscribe({
      next: (hours) => {
        this.saving.set(false);
        this.dirty.set(false);
        this.week.set(weekRows(hours));
        this.resources.update((list) => list.map((resource) => (resource.id === equipment.id ? { ...resource, hours } : resource)));
        this.snack.open(`Horario de ${equipment.name} guardado.`, 'OK', { duration: 5000 });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.snack.open(apiMessage(err), 'OK', { duration: 8000 });
      },
    });
  }

  addBlock(equipment: AgendaResource): void {
    if (this.blockForm.invalid || this.saving()) return;
    const { from, to, reason } = this.blockForm.getRawValue();
    const instant = (value: string): string => {
      const [, date, clock] = LOCAL_DATE_TIME.exec(value) ?? [];
      return instantAt(date, clock, this.timeZone());
    };
    const input = { startsAt: instant(from), endsAt: instant(to), reason: reason.trim() };
    if (input.startsAt >= input.endsAt) {
      this.blockError.set('El bloqueo debe terminar después de que empieza.');
      return;
    }
    if (input.endsAt <= new Date().toISOString()) {
      this.blockError.set('Ese lapso ya pasó. Un bloqueo debe terminar en el futuro.');
      return;
    }
    this.saving.set(true);
    this.blockError.set(null);
    this.api.createBlock(equipment.id, input).subscribe({
      next: () => {
        this.saving.set(false);
        // `resetForm` y no `reset`: también borra la marca de enviado, que pintaría de rojo los campos vacíos.
        this.blockFormDirective()?.resetForm();
        this.loadBlocks(equipment.id);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.blockError.set(apiMessage(err));
      },
    });
  }

  removeBlock(equipment: AgendaResource, block: AgendaBlock): void {
    if (this.saving() || !confirm(`¿Quitar el bloqueo «${block.reason}» (${this.span(block)})? El equipo vuelve a poder agendarse en ese lapso.`)) return;
    this.saving.set(true);
    this.api.removeBlock(equipment.id, block.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.loadBlocks(equipment.id);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.blockError.set(apiMessage(err));
        // Si ya no existía, la lista en pantalla es vieja.
        this.loadBlocks(equipment.id);
      },
    });
  }

  private loadBlocks(equipmentId: string): void {
    this.api.blocks(equipmentId).subscribe({
      next: (blocks) => this.selected()?.id === equipmentId && this.blocks.set(blocks),
      error: () => this.selected()?.id === equipmentId && this.blockError.set('No pudimos cargar los bloqueos de este equipo.'),
    });
  }
}
