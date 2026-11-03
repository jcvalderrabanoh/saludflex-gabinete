import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { EstablishmentStatus, EvidenceAnalysis, EvidenceRecord } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { confidenceLevel, formFromAnalysis } from './analyze-document.helpers';
import { apiMessage } from './record-evidence.dialog';

export interface AnalyzeDocumentData {
  status: EstablishmentStatus;
}

type Step = 'pick' | 'reading' | 'review';

/**
 * Subir un documento y que la IA proponga obligación, fechas y notas con su
 * confianza. La persona revisa y guarda con el registro normal (append-only).
 */
@Component({
  selector: 'app-analyze-document-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Subir documento</h2>
    <mat-dialog-content>
      @switch (step()) {
        @case ('pick') {
          <p class="hint">Leemos el documento y te proponemos a qué obligación corresponde y sus fechas. Tú lo revisas antes de guardar.</p>
          <label class="upload">
            <input type="file" accept="image/*,application/pdf" capture="environment" (change)="pick($event)" />
            <span class="cta">Tomar foto o subir PDF</span>
            <span class="small">Foto del celular o PDF del proveedor, hasta 10 páginas</span>
          </label>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
            <button mat-stroked-button type="button" (click)="fillByHand()">Llenar a mano</button>
          }
        }
        @case ('reading') {
          <p class="hint" aria-live="polite">Leyendo «{{ fileName() }}»… puede tardar unos segundos.</p>
          <mat-progress-bar mode="indeterminate" />
        }
        @case ('review') {
          @if (analysis(); as a) {
            <div class="summary">
              <span class="doc">{{ a.documentType || 'Documento' }}</span>
              <span class="badge" [class]="'badge ' + level(a.confidence.overall).tone">
                {{ level(a.confidence.overall).label }} · {{ a.confidence.overall }} %
              </span>
            </div>
            @for (w of a.warnings; track w) { <p class="warn" role="status">{{ w }}</p> }
          } @else {
            <p class="hint">Captura los datos con el documento a la vista.</p>
          }
          <form [formGroup]="form" class="form">
            <mat-form-field appearance="outline" class="wide">
              <mat-label>Obligación</mat-label>
              <mat-select formControlName="obligationId">
                @for (o of obligations; track o.id) {
                  <mat-option [value]="o.id">{{ o.title }}@if (o.subjectLabel) { · {{ o.subjectLabel }} }</mat-option>
                }
              </mat-select>
              @if (hint('obligation'); as h) { <mat-hint>{{ h }}</mat-hint> }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Fecha del documento</mat-label>
              <input matInput type="date" formControlName="performedOn" [max]="data.status.today" />
              @if (hint('performedOn'); as h) { <mat-hint>{{ h }}</mat-hint> }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Vigente hasta (si lo dice)</mat-label>
              <input matInput type="date" formControlName="validUntil" />
              @if (hint('validUntil'); as h) { <mat-hint>{{ h }}</mat-hint> }
            </mat-form-field>
            <mat-form-field appearance="outline" class="wide">
              <mat-label>Notas</mat-label>
              <textarea matInput rows="2" formControlName="notes"></textarea>
            </mat-form-field>
            <p class="trace wide"><strong>Revisa antes de guardar:</strong> la IA puede equivocarse y los registros no se borran; corregir crea uno nuevo con motivo.</p>
          </form>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      @if (step() === 'review') {
        <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
          {{ saving() ? 'Guardando…' : 'Guardar evidencia' }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .hint { margin: 0 0 12px; color: #64748b; font-size: 14px; }
    .upload { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 24px; border: 2px dashed #93c5fd; border-radius: 12px; background: #eff6ff; cursor: pointer; margin-bottom: 12px; }
    .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .cta { color: #1d4ed8; font-weight: 600; } .small { font-size: 12px; color: #64748b; }
    .summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .doc { font-weight: 600; }
    .badge { font-size: 13px; font-weight: 600; border-radius: 8px; padding: 2px 10px; }
    .badge.high { background: #e7f6ef; color: #08764e; } .badge.medium { background: #fff3d6; color: #805800; } .badge.low { background: #fdecee; color: #b4232c; }
    .warn { margin: 0 0 8px; font-size: 13px; background: #fff3d6; color: #805800; border-radius: 8px; padding: 6px 10px; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-top: 12px; }
    .wide { grid-column: 1 / -1; }
    .trace { font-size: 12px; background: #fffbeb; border: 1px solid #fde68a; color: #78350f; border-radius: 10px; padding: 8px 12px; margin: 0 0 8px; }
    .error { color: #b91c1c; font-size: 13px; }
    @media (max-width: 767.98px) { .form { grid-template-columns: 1fr; } }
  `],
})
export class AnalyzeDocumentDialogComponent {
  readonly data = inject<AnalyzeDocumentData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AnalyzeDocumentDialogComponent, EvidenceRecord>);
  private readonly api = inject(FacilityApiService);
  /** Solo las obligaciones en que el usuario puede registrar (con permiso asignado, las suyas). */
  private readonly permissions = inject(PermissionsService);
  readonly obligations = this.data.status.obligations.filter((o) => this.permissions.canRecord(o));
  readonly step = signal<Step>('pick');
  readonly analysis = signal<EvidenceAnalysis | null>(null);
  readonly fileName = signal('');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private file: File | null = null;

  readonly form = inject(FormBuilder).nonNullable.group({
    obligationId: ['', Validators.required],
    performedOn: ['', Validators.required],
    validUntil: [''],
    notes: [''],
  });

  readonly level = confidenceLevel;

  pick(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!this.file) return;
    this.fileName.set(this.file.name);
    this.error.set(null);
    this.step.set('reading');
    this.api.analyzeEvidence(this.data.status.establishmentId, this.file).subscribe({
      next: (analysis) => {
        this.analysis.set(analysis);
        this.form.setValue(formFromAnalysis(analysis));
        this.step.set('review');
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiMessage(err));
        this.step.set('pick');
      },
    });
  }

  /** Si la IA no pudo leerlo, se registra igual con el archivo y los datos a mano. */
  fillByHand(): void {
    this.error.set(null);
    this.step.set('review');
  }

  hint(field: 'obligation' | 'performedOn' | 'validUntil'): string | null {
    const a = this.analysis();
    if (!a) return null;
    const value = field === 'obligation' ? a.obligation : a.fields[field];
    return value ? `Sugerido por IA · ${a.confidence[field]} %` : null;
  }

  save(): void {
    const { obligationId, ...value } = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api.recordEvidence(obligationId, { ...value, validUntil: value.validUntil || undefined, file: this.file }).subscribe({
      next: (record) => this.ref.close(record),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
