import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Equipment, Personnel } from '../../core/models/facility.models';
import { MODALITY_LABELS, ROLE_LABELS, SERVICE_LABELS } from '../../core/models/labels';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { SubjectFormData, SubjectFormDialogComponent, SubjectFormResult } from './subject-form.dialog';

/** Equipos y personal: registrarlos activa solas sus obligaciones. */
@Component({
  selector: 'app-subjects',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatSnackBarModule],
  template: `
    <h1>Equipos y personal</h1>
    <p class="sub">Registra cada equipo y a cada persona: el sistema activa su control de calidad, mantenimiento, dosimetría, capacitación y cédula, y te avisa antes de que venzan.</p>

    <section>
      <div class="head"><h2>Equipos</h2><button mat-flat-button color="primary" (click)="open({ kind: 'equipment' })">Registrar equipo</button></div>
      @if (equipment().length === 0) { <p class="empty">Sin equipos registrados.</p> }
      <div class="grid">
        @for (e of equipment(); track e.id) {
          <mat-card class="tile">
            @if (e.room) { <span class="room">{{ e.room }}</span> }
            <div class="title">{{ e.name }}</div>
            <div class="meta">{{ modality(e) }}</div>
            <dl>
              @if (e.manufacturer) { <dt>Marca</dt><dd>{{ e.manufacturer }}{{ e.model ? ' ' + e.model : '' }}</dd> }
              <dt>Número de serie</dt><dd class="mono">{{ e.serialNumber || '—' }}</dd>
            </dl>
            <div class="tile-actions">
              <button mat-button (click)="open({ kind: 'equipment', current: e })">Editar</button>
              <button mat-button color="warn" (click)="retireEquipment(e)">Dar de baja</button>
            </div>
          </mat-card>
        }
      </div>
    </section>

    <section>
      <div class="head"><h2>Personal</h2><button mat-flat-button color="primary" (click)="open({ kind: 'person' })">Registrar persona</button></div>
      @if (personnel().length === 0) { <p class="empty">Sin personal registrado.</p> }
      @for (p of personnel(); track p.id) {
        <mat-card class="row">
          <div class="text">
            <div class="title">{{ p.fullName }} @if (p.occupationallyExposed) { <span class="tag">POE</span> }</div>
            <div class="meta">{{ role(p) }}{{ p.professionalLicense ? ' · cédula ' + p.professionalLicense : '' }}</div>
          </div>
          <button mat-button (click)="open({ kind: 'person', current: p })">Editar</button>
          <button mat-button (click)="retirePerson(p)">Dar de baja</button>
        </mat-card>
      }
    </section>
  `,
  styles: [`
    h1 { margin: 0; } .sub { color: #64748b; max-width: 760px; }
    section { margin-top: 20px; max-width: 900px; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    h2 { font-size: 16px; margin: 0; color: #1e3a8a; }
    .row { display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 10px 14px; margin-bottom: 8px; }
    .text { flex: 1; } .title { font-weight: 600; } .meta { font-size: 12px; color: #64748b; }
    .tag { font-size: 11px; background: #fef3c7; color: #92400e; border-radius: 8px; padding: 1px 8px; margin-left: 6px; }
    .empty { color: #64748b; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .tile { padding: 16px; }
    .room { align-self: flex-start; font-size: 11px; font-weight: 600; background: #eff6ff; color: #1d4ed8; border-radius: 6px; padding: 2px 8px; margin-bottom: 8px; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; margin: 12px 0 4px; }
    dt { color: #64748b; } dd { margin: 0; text-align: right; } .mono { font-family: monospace; }
    .tile-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 8px; }
  `],
})
export class SubjectsComponent {
  private readonly api = inject(FacilityApiService);
  private readonly context = inject(EstablishmentContextService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  readonly equipment = signal<Equipment[]>([]);
  readonly personnel = signal<Personnel[]>([]);

  constructor() {
    effect(() => {
      const e = this.context.current();
      if (e) this.load(e.id);
    });
  }

  load(id: string): void {
    this.api.equipment(id).subscribe((list) => this.equipment.set(list));
    this.api.personnel(id).subscribe((list) => this.personnel.set(list));
  }

  modality(e: Equipment): string {
    return MODALITY_LABELS[e.modality] ?? e.modality;
  }

  role(p: Personnel): string {
    return ROLE_LABELS[p.role] ?? p.role;
  }

  open(partial: { kind: 'equipment'; current?: Equipment } | { kind: 'person'; current?: Personnel }): void {
    const establishmentId = this.context.current()?.id;
    if (!establishmentId) return;
    const data = { ...partial, establishmentId } as SubjectFormData;
    this.dialog
      .open(SubjectFormDialogComponent, { width: '600px', data })
      .afterClosed()
      .subscribe((result?: SubjectFormResult) => {
        if (!result) return;
        this.notify(result);
        this.load(establishmentId);
      });
  }

  /** El servicio faltante se queda en pantalla hasta que lo atiendan; lo demás se va solo. */
  private notify(result: SubjectFormResult): void {
    const message = subjectSavedMessage(result);
    if (!message) return;
    if (!result.missingService) {
      this.snack.open(message, 'OK', { duration: 5000 });
      return;
    }
    this.snack
      .open(message, 'Ir a Establecimientos')
      .onAction()
      .subscribe(() => this.router.navigate(['/operacion/establecimientos']));
  }

  retireEquipment(e: Equipment): void {
    if (!confirm(`¿Dar de baja «${e.name}»? Sus obligaciones se desactivan; la evidencia se conserva.`)) return;
    this.api.retireEquipment(e.id).subscribe(() => this.load(e.establishmentId));
  }

  retirePerson(p: Personnel): void {
    if (!confirm(`¿Dar de baja a «${p.fullName}»? Sus obligaciones se desactivan; la evidencia se conserva.`)) return;
    this.api.retirePerson(p.id).subscribe(() => this.load(p.establishmentId));
  }
}

export function activatedMessage(n: number): string {
  return n === 1 ? 'Se activó 1 obligación. Revísala en «Hoy».' : `Se activaron ${n} obligaciones. Revísalas en «Hoy».`;
}

/** Mensaje al guardar: primero el servicio que falta en el establecimiento; si no, cuántas obligaciones nacieron. */
export function subjectSavedMessage(result: SubjectFormResult): string | null {
  if (result.missingService) {
    const service = SERVICE_LABELS[result.missingService] ?? result.missingService;
    return `Este equipo es de ${service} y el establecimiento no tiene ese servicio. Agrégalo en «Establecimientos» para activar las obligaciones que le tocan.`;
  }
  return result.activated > 0 ? activatedMessage(result.activated) : null;
}
