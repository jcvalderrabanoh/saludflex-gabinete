import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { EvaluatedObligation, EvidenceRecord } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { RecordEvidenceDialogComponent } from './record-evidence.dialog';

export interface EvidenceHistoryData {
  obligation: EvaluatedObligation;
  today: string;
}

@Component({
  selector: 'app-evidence-history-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Historial · {{ data.obligation.title }}</h2>
    <mat-dialog-content>
      @if (records().length === 0) {
        <p class="empty">Todavía no hay registros.</p>
      }
      <ul class="list">
        @for (r of records(); track r.id) {
          <li [class.corrected]="r.correctedBy">
            <div class="row">
              <strong>{{ r.performedOn }}</strong>
              @if (r.validUntil) { <span>vigente hasta {{ r.validUntil }}</span> }
              @if (r.correctedBy) { <span class="tag">corregido</span> }
              @if (r.correctsRecordId) { <span class="tag fix">corrección</span> }
              <span class="spacer"></span>
              @if (r.hasFile) { <button mat-button (click)="open(r)">Ver archivo</button> }
              @if (!r.correctedBy) { <button mat-button (click)="correct(r)">Corregir</button> }
            </div>
            @if (r.notes) { <p class="notes">{{ r.notes }}</p> }
            @if (r.correctionReason) { <p class="notes">Motivo: {{ r.correctionReason }}</p> }
            <p class="meta">Registrado {{ r.createdAt.slice(0, 16).replace('T', ' ') }} · eslabón {{ r.accountSeq }} · {{ r.hash.slice(0, 12) }}…</p>
          </li>
        }
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Cerrar</button></mat-dialog-actions>
  `,
  styles: [`
    .list { list-style: none; padding: 0; margin: 0; }
    li { border-bottom: 1px solid #e2e8f0; padding: 10px 0; }
    li.corrected { opacity: 0.6; }
    .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .spacer { flex: 1; }
    .tag { font-size: 11px; background: #e2e8f0; border-radius: 8px; padding: 1px 8px; }
    .tag.fix { background: #dbeafe; }
    .notes { margin: 4px 0 0; font-size: 13px; }
    .meta { margin: 4px 0 0; font-size: 11px; color: #94a3b8; font-family: monospace; }
    .empty { color: #64748b; }
  `],
})
export class EvidenceHistoryDialogComponent implements OnInit {
  readonly data = inject<EvidenceHistoryData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);
  readonly records = signal<EvidenceRecord[]>([]);
  /** Avisa a quien abrió el historial que algo cambió. */
  changed = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.records(this.data.obligation.id).subscribe((records) => this.records.set(records));
  }

  open(record: EvidenceRecord): void {
    this.api.evidenceFile(record.id).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  correct(record: EvidenceRecord): void {
    this.dialog
      .open(RecordEvidenceDialogComponent, {
        width: '560px',
        data: { obligation: this.data.obligation, today: this.data.today, correcting: record },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.changed = true;
          this.load();
        }
      });
  }
}
