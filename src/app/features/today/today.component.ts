import { Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
  imports: [MatCardModule, MatButtonModule, MatProgressBarModule, StatusChipComponent],
  template: `
    @if (status(); as s) {
      <div class="head">
        <div>
          <h1>Hoy</h1>
          <p class="sub">{{ s.establishmentName }} · {{ s.today }}</p>
        </div>
        <mat-card class="score">
          <div class="pct">{{ s.score.percent }} %</div>
          <div class="label">listo para inspección</div>
          <mat-progress-bar mode="determinate" [value]="s.score.percent" />
          <div class="counts">{{ s.score.overdue }} vencidas · {{ s.score.missing }} faltan · {{ s.score.dueSoon }} por vencer · {{ s.score.ok }} vigentes</div>
        </mat-card>
      </div>

      @if (s.todayItems.length === 0) {
        <mat-card class="empty"><p>Todo vigente. Nada que registrar hoy.</p></mat-card>
      } @else {
        <p class="lead">{{ summary(s) }}</p>
        <div class="items">
          @for (o of s.todayItems; track o.id) {
            <mat-card class="item">
              <div class="row">
                <app-status-chip [status]="o.status" />
                <div class="text">
                  <div class="title">{{ o.title }}@if (o.subjectLabel) { <span class="subject"> · {{ o.subjectLabel }}</span> }</div>
                  <div class="due">{{ o.status === 'missing' ? 'Sin registro todavía' : due(o) }}</div>
                  <div class="evidence">Evidencia: {{ o.evidence }}</div>
                </div>
                <div class="actions">
                  <button mat-flat-button color="primary" (click)="record(o)">Registrar</button>
                  @if (o.currentRecord) { <button mat-button (click)="history(o)">Historial</button> }
                </div>
              </div>
            </mat-card>
          }
        </div>
      }
    } @else if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
    h1 { margin: 0; } .sub { margin: 4px 0 0; color: #64748b; }
    .score { padding: 16px 20px; min-width: 280px; }
    .pct { font-size: 34px; font-weight: 700; color: #2563c9; line-height: 1; }
    .label { font-size: 13px; color: #475569; margin: 4px 0 8px; }
    .counts { font-size: 12px; color: #64748b; margin-top: 8px; }
    .lead { color: #334155; }
    .items { display: grid; gap: 10px; }
    .item { padding: 14px 16px; }
    .row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
    .text { flex: 1; min-width: 240px; }
    .title { font-weight: 600; } .subject { font-weight: 400; color: #475569; }
    .due { font-size: 13px; color: #334155; margin-top: 2px; }
    .evidence { font-size: 12px; color: #64748b; margin-top: 2px; }
    .actions { display: flex; gap: 6px; }
    .empty { padding: 24px; text-align: center; color: #166534; }
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
