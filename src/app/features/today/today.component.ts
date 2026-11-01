import { Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { EstablishmentStatus, EvaluatedObligation } from '../../core/models/facility.models';
import { dueLabel } from '../../core/models/labels';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { EvidenceHistoryDialogComponent } from '../evidence/evidence-history.dialog';
import { RecordEvidenceDialogComponent } from '../evidence/record-evidence.dialog';

/** «Hoy»: lo vencido, lo faltante y lo por vencer, con un botón para registrar. */
@Component({
  selector: 'app-today',
  standalone: true,
  imports: [MatButtonModule, MatProgressBarModule, StatusChipComponent],
  template: `
    @if (status(); as s) {
      <div class="top">
        <section class="card intro">
          <span class="place">{{ s.establishmentName }}</span>
          <h1>Hoy · {{ s.today }}</h1>
          <p class="sub">Lo que hay que registrar o renovar para tener la evidencia al día.</p>
          @if (s.todayItems.length > 0) {
            <p class="alert"><span class="dot red"></span>{{ summary(s) }}</p>
          } @else {
            <p class="ok-line"><span class="dot green"></span>Todo vigente. Nada que registrar hoy.</p>
          }
        </section>
        <section class="card score">
          <div class="label-row"><span class="caps">Disponibilidad de carpeta</span></div>
          <div class="pct">{{ s.score.percent }} %<small>listo para inspección</small></div>
          <mat-progress-bar mode="determinate" [value]="s.score.percent" />
          <div class="counters">
            <div class="counter overdue"><span>Vencida</span><b>{{ s.score.overdue }}</b></div>
            <div class="counter missing"><span>Faltan</span><b>{{ s.score.missing }}</b></div>
            <div class="counter due-soon"><span>Por vencer</span><b>{{ s.score.dueSoon }}</b></div>
            <div class="counter ok"><span>Vigente</span><b>{{ s.score.ok }}</b></div>
          </div>
        </section>
      </div>

      @if (s.todayItems.length > 0) {
        <h2>Obligaciones prioritarias hoy <span class="count">{{ s.todayItems.length }}</span></h2>
        <div class="items">
          @for (o of s.todayItems; track o.id) {
            <article class="item" [class]="'item ' + o.status">
              <div class="text">
                <div class="tags">
                  <app-status-chip [status]="o.status" />
                  <span class="norm">{{ o.norms[0] }}</span>
                  <span class="due" [class]="'due ' + o.status">{{ o.status === 'missing' ? 'Sin registro todavía' : due(o) }}</span>
                </div>
                <div class="title">{{ o.title }}</div>
                @if (o.subjectLabel) { <div class="subject">Sujeto: <b>{{ o.subjectLabel }}</b></div> }
                <div class="evidence">Evidencia: {{ o.evidence }}</div>
              </div>
              <div class="actions">
                @if (o.currentRecord) { <button mat-button (click)="history(o)">Historial</button> }
                <button mat-flat-button color="primary" (click)="record(o)">Registrar</button>
              </div>
            </article>
          }
        </div>
      }
      <p class="disclaimer">El Sistema Integral de Gabinete organiza la evidencia del establecimiento; no emite certificados ni garantiza el resultado de una verificación.</p>
    } @else if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
  styles: [`
    .top { display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; margin-bottom: 22px; }
    @media (max-width: 900px) { .top { grid-template-columns: 1fr; } }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px 22px; }
    .place { display: inline-block; font-size: 12px; font-weight: 600; background: #f1f5f9; border-radius: 8px; padding: 3px 10px; color: #334155; }
    h1 { margin: 10px 0 6px; font-size: 28px; line-height: 1.2; }
    .sub { margin: 0 0 14px; color: #475569; }
    .alert, .ok-line { margin: 0; padding-top: 12px; border-top: 1px solid #f1f5f9; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .alert { color: #b91c1c; } .ok-line { color: #166534; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot.red { background: #dc2626; } .dot.green { background: #16a34a; }
    .caps { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #475569; }
    .pct { font-size: 40px; font-weight: 700; color: #0f172a; margin: 8px 0 10px; }
    .pct small { font-size: 16px; font-weight: 500; margin-left: 10px; color: #334155; }
    .counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
    .counter { border-radius: 10px; padding: 8px; text-align: center; border: 1px solid; }
    .counter span { display: block; font-size: 12px; } .counter b { font-size: 20px; }
    .counter.overdue, .counter.missing { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
    .counter.due-soon { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .counter.ok { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
    h2 { font-size: 18px; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
    .count { font-size: 12px; background: #e2e8f0; border-radius: 10px; padding: 1px 8px; }
    .items { display: grid; gap: 12px; }
    .item { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; background: #fff; border: 1px solid #e2e8f0; border-left: 5px solid #cbd5e1; border-radius: 14px; padding: 16px 20px; }
    .item.overdue, .item.missing { border-left-color: #b91c1c; }
    .item.due-soon { border-left-color: #b45309; }
    .item.ok { border-left-color: #15803d; }
    .text { flex: 1; min-width: 260px; }
    .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 6px; }
    .norm { font-size: 12px; background: #f1f5f9; color: #475569; border-radius: 6px; padding: 2px 8px; }
    .due { font-size: 13px; font-weight: 600; }
    .due.overdue, .due.missing { color: #b91c1c; } .due.due-soon { color: #92400e; } .due.ok { color: #166534; }
    .title { font-weight: 700; font-size: 17px; }
    .subject { font-size: 13px; color: #475569; margin-top: 4px; }
    .evidence { font-size: 12px; color: #64748b; margin-top: 2px; }
    .actions { display: flex; gap: 8px; align-items: center; }
    .disclaimer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 28px; }
  `],
})
export class TodayComponent {
  private readonly api = inject(FacilityApiService);
  private readonly context = inject(EstablishmentContextService);
  private readonly dialog = inject(MatDialog);
  readonly status = signal<EstablishmentStatus | null>(null);
  readonly loading = signal(false);

  constructor() {
    effect(() => {
      const establishment = this.context.current();
      if (establishment) this.load(establishment.id);
    });
  }

  load(id: string): void {
    this.loading.set(true);
    this.api.status(id).subscribe({
      next: (status) => {
        this.status.set(status);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  due(o: EvaluatedObligation): string {
    return dueLabel(o.daysLeft, o.dueOn);
  }

  summary(s: EstablishmentStatus): string {
    return todaySummary(s);
  }

  record(obligation: EvaluatedObligation): void {
    this.dialog
      .open(RecordEvidenceDialogComponent, { width: '560px', data: { obligation, today: this.status()?.today } })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  history(obligation: EvaluatedObligation): void {
    const ref = this.dialog.open(EvidenceHistoryDialogComponent, {
      width: '640px',
      data: { obligation, today: this.status()?.today },
    });
    ref.afterClosed().subscribe(() => ref.componentInstance.changed && this.reload());
  }

  private reload(): void {
    const id = this.context.current()?.id;
    if (id) this.load(id);
  }
}

/** «3 cosas para hoy: 1 vencida, 2 por registrar.» */
export function todaySummary(s: EstablishmentStatus): string {
  const n = s.todayItems.length;
  const parts = [
    s.score.overdue && `${s.score.overdue} ${s.score.overdue === 1 ? 'vencida' : 'vencidas'}`,
    s.score.missing && `${s.score.missing} sin registro`,
    s.score.dueSoon && `${s.score.dueSoon} por vencer`,
  ].filter(Boolean);
  return `${n} ${n === 1 ? 'cosa necesita' : 'cosas necesitan'} atención: ${parts.join(', ')}.`;
}
