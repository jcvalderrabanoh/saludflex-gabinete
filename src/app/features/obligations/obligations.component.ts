import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { EstablishmentStatus, EvaluatedObligation } from '../../core/models/facility.models';
import { FOLDER_SECTIONS, dueLabel } from '../../core/models/labels';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { CanDirective, CanRecordDirective } from '../../shared/directives/can.directive';
import { ExportListsButtonComponent } from '../../shared/components/export-lists-button.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { EvidenceHistoryDialogComponent } from '../evidence/evidence-history.dialog';
import { RecordEvidenceDialogComponent } from '../evidence/record-evidence.dialog';
import { ActivateObligationDialogComponent } from './activate-obligation.dialog';
import { windowState } from '../calendar/payment-window.helpers';
import { PaymentWindowDialogComponent } from './payment-window.dialog';
import { ResponsiblesDialogComponent } from './responsibles.dialog';

const SHORT_FORMAT = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = (date: string) => SHORT_FORMAT.format(new Date(`${date}T00:00:00Z`));

/** Semáforo completo, por sección de la carpeta. */
@Component({
  selector: 'app-obligations',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatMenuModule, StatusChipComponent, CanDirective, CanRecordDirective, ExportListsButtonComponent],
  template: `
    <div class="head">
      <div>
        <h1>Obligaciones</h1>
        <p class="sub">Lo que el verificador revisa, en el orden de la visita. † = periodicidad de planeación pendiente de verificar.</p>
      </div>
      <div class="actions">
        <app-export-lists-button />
        <button *appCan="'manage'" mat-flat-button color="primary" (click)="activate()" [disabled]="!context.current()">Activar obligación</button>
      </div>
    </div>
    @for (section of sections(); track section.order) {
      <h2>{{ section.title }}</h2>
      <mat-card>
        @for (o of section.items; track o.id) {
          <div class="row">
            <app-status-chip [status]="o.status" />
            <div class="text">
              <div class="title">{{ o.title }}{{ o.verification === 'NV' ? ' †' : '' }}@if (o.subjectLabel) { <span class="subject"> · {{ o.subjectLabel }}</span> }</div>
              <div class="meta">{{ o.currentRecord ? due(o) : 'Sin registro' }} · {{ o.norms.join(' · ') }}</div>
              @if (o.window) { <div class="window">Plazo de pago: {{ windowText(o) }}</div> }
            </div>
            <div class="responsible">
              <span class="label">Responsable</span>
              @for (r of o.responsibles ?? []; track r.id) {
                <span class="person" [class.invalid]="!r.valid">{{ r.name }}@if (!r.valid) { <span class="flag"> · Responsable inválido</span> }</span>
              } @empty {
                <span class="none">Sin asignar</span>
              }
            </div>
            <div class="row-actions">
              <button *appCanRecord="o" mat-button (click)="record(o)">Registrar</button>
              <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Más acciones"><mat-icon>more_vert</mat-icon></button>
            </div>
            <mat-menu #menu="matMenu">
              <button mat-menu-item (click)="history(o)">Historial</button>
              <button *appCan="'manage'" mat-menu-item (click)="assign(o)">Asignar responsables</button>
              <button *appCan="'manage'" mat-menu-item (click)="paymentWindow(o)">{{ o.window ? 'Cambiar plazo de pago' : 'Poner plazo de pago' }}</button>
              <button *appCan="'manage'" mat-menu-item (click)="deactivate(o)">Desactivar</button>
            </mat-menu>
          </div>
        }
      </mat-card>
    }
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    h1 { margin: 0; } .sub { margin: 4px 0 16px; color: #64748b; font-size: 13px; }
    h2 { font-size: 15px; margin: 22px 0 8px; color: #1e3a8a; }
    .row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
    .responsible { display: flex; flex-direction: column; min-width: 160px; font-size: 13px; }
    .responsible .label { font-size: 12px; color: #6b7684; }
    .person.invalid { color: #b4232c; } .flag { font-weight: 600; } .none { color: #6b7684; }
    .row-actions { display: flex; align-items: center; }
    @media (max-width: 767.98px) {
      .row { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: 'chip text text' 'resp resp actions'; row-gap: 4px; }
      .row > app-status-chip { grid-area: chip; } .text { grid-area: text; min-width: 0; }
      .responsible { grid-area: resp; min-width: 0; } .row-actions { grid-area: actions; }
    }
    .row:last-child { border-bottom: 0; }
    .text { flex: 1; } .title { font-weight: 600; font-size: 14px; } .subject { font-weight: 400; color: #475569; }
    .meta { font-size: 12px; color: #64748b; }
    .window { font-size: 12px; color: #78350f; font-weight: 600; margin-top: 2px; }
  `],
})
export class ObligationsComponent {
  readonly context = inject(EstablishmentContextService);
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);
  readonly status = signal<EstablishmentStatus | null>(null);
  readonly sections = computed(() => groupSections(this.status()?.obligations ?? []));

  constructor() {
    effect(() => {
      const e = this.context.current();
      if (e) this.load(e.id);
    });
  }

  load(id: string): void {
    this.api.status(id).subscribe((s) => this.status.set(s));
  }

  due(o: EvaluatedObligation): string {
    return dueLabel(o.daysLeft, o.dueOn);
  }

  activate(): void {
    const establishment = this.context.current();
    if (!establishment) return;
    this.api.catalog().subscribe((catalog) =>
      this.dialog
        .open(ActivateObligationDialogComponent, { data: { establishment, catalog: catalog.obligations } })
        .afterClosed()
        .subscribe((done) => done && this.load(establishment.id)),
    );
  }

  record(obligation: EvaluatedObligation): void {
    this.dialog
      .open(RecordEvidenceDialogComponent, { width: '560px', data: { obligation, today: this.status()?.today } })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  history(obligation: EvaluatedObligation): void {
    const ref = this.dialog.open(EvidenceHistoryDialogComponent, { width: '640px', data: { obligation, today: this.status()?.today } });
    ref.afterClosed().subscribe(() => ref.componentInstance.changed && this.reload());
  }

  assign(obligation: EvaluatedObligation): void {
    this.dialog
      .open(ResponsiblesDialogComponent, { width: '520px', data: { obligation } })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  /** «del 1 ene al 31 mar · Abierto · vence en 5 días». */
  windowText(o: EvaluatedObligation): string {
    if (!o.window) return '';
    const label = windowState(o.window, this.status()?.today ?? '').label;
    return `del ${shortDate(o.window.startsOn)} al ${shortDate(o.window.endsOn)} · ${label}`;
  }

  paymentWindow(obligation: EvaluatedObligation): void {
    this.dialog
      .open(PaymentWindowDialogComponent, { width: '480px', data: { obligation } })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  deactivate(obligation: EvaluatedObligation): void {
    if (!confirm(`¿Desactivar «${obligation.title}»? Su evidencia se conserva.`)) return;
    this.api.deactivateObligation(obligation.id).subscribe(() => this.reload());
  }

  private reload(): void {
    const id = this.context.current()?.id;
    if (id) this.load(id);
  }
}

export function groupSections(obligations: EvaluatedObligation[]): Array<{ order: number; title: string; items: EvaluatedObligation[] }> {
  const map = new Map<number, EvaluatedObligation[]>();
  for (const o of obligations) map.set(o.folderOrder, [...(map.get(o.folderOrder) ?? []), o]);
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([order, items]) => ({ order, title: FOLDER_SECTIONS[order] ?? 'Otros', items }));
}
