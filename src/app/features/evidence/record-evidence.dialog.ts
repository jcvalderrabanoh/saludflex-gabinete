import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EvaluatedObligation, EvidenceRecord } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';

export interface RecordEvidenceData {
  obligation: EvaluatedObligation;
  /** Fecha local de hoy del establecimiento (tope para la fecha del registro). */
  today: string;
  /** Si viene, se corrige este registro en vez de crear uno nuevo. */
  correcting?: EvidenceRecord;
}

@Component({
  selector: 'app-record-evidence-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.correcting ? 'Corregir registro' : 'Registrar evidencia' }}</h2>
    <mat-dialog-content>
      <p class="what"><strong>{{ data.obligation.title }}</strong>@if (data.obligation.subjectLabel) { · {{ data.obligation.subjectLabel }} }</p>
      <p class="hint">Se adjunta: {{ data.obligation.evidence }}</p>
      @if (data.correcting) {
        <p class="hint">El registro original no se borra: queda visible como corregido, con tu motivo.</p>
      }
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>{{ data.obligation.kind === 'document' ? 'Fecha de emisión' : 'Fecha en que se hizo' }}</mat-label>
          <input matInput type="date" formControlName="performedOn" [max]="data.today" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Vigente hasta {{ data.obligation.kind === 'document' ? '' : '(si el documento lo dice)' }}</mat-label>
          <input matInput type="date" formControlName="validUntil" />
          @if (data.obligation.kind === 'document') {
            <mat-hint>Déjalo vacío si el documento no vence</mat-hint>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
        @if (data.correcting) {
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Motivo de la corrección</mat-label>
            <textarea matInput rows="2" formControlName="correctionReason"></textarea>
          </mat-form-field>
        }
        <label class="upload wide" [class.has-file]="fileName()">
          <input type="file" accept="image/*,application/pdf" (change)="pick($event)" />
          @if (fileName(); as name) {
            <span class="ok">✓ {{ name }}</span>
            <span class="small">Toca para cambiarlo</span>
          } @else {
            <span class="cta">Tomar foto o elegir archivo</span>
            <span class="small">{{ data.correcting ? 'Si no subes uno nuevo, se conserva el anterior' : 'Foto, imagen guardada o PDF' }}</span>
          }
        </label>
        <p class="trace wide"><strong>Aviso de trazabilidad:</strong> los registros no se borran; corregir crea uno nuevo con motivo.</p>
      </form>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        {{ saving() ? 'Guardando…' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .what { margin: 0 0 4px; } .hint { margin: 0 0 8px; color: #64748b; font-size: 13px; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; margin-top: 12px; }
    .wide { grid-column: 1 / -1; }
    @media (max-width: 767.98px) { .form { grid-template-columns: 1fr; } }
    .upload { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px; border: 2px dashed #93c5fd; border-radius: 12px; background: #eff6ff; cursor: pointer; margin-bottom: 12px; }
    .upload.has-file { border-style: solid; border-color: #86efac; background: #f0fdf4; }
    .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .cta { color: #1d4ed8; font-weight: 600; } .ok { color: #166534; font-weight: 600; }
    .small { font-size: 12px; color: #64748b; }
    .trace { font-size: 12px; background: #fffbeb; border: 1px solid #fde68a; color: #78350f; border-radius: 10px; padding: 8px 12px; margin: 0 0 8px; }
    .error { color: #b91c1c; font-size: 13px; }
  `],
})
export class RecordEvidenceDialogComponent {
  readonly data = inject<RecordEvidenceData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<RecordEvidenceDialogComponent, EvidenceRecord>);
  private readonly api = inject(FacilityApiService);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private file: File | null = null;
  readonly fileName = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    performedOn: [this.data.correcting?.performedOn ?? this.data.today, Validators.required],
    validUntil: [this.data.correcting?.validUntil ?? ''],
    notes: [this.data.correcting?.notes ?? ''],
    correctionReason: ['', this.data.correcting ? Validators.required : []],
  });

  pick(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.fileName.set(this.file?.name ?? null);
  }

  save(): void {
    const value = this.form.getRawValue();
    const input = { ...value, validUntil: value.validUntil || undefined, file: this.file };
    const request = this.data.correcting
      ? this.api.correctEvidence(this.data.correcting.id, input)
      : this.api.recordEvidence(this.data.obligation.id, input);
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (record) => this.ref.close(record),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}

/** El mensaje que manda Nest (string o arreglo de validación). */
export function apiMessage(err: HttpErrorResponse): string {
  const message = err.error?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string') return message;
  return err.status === 0 ? 'No hay conexión con el servidor.' : 'No se pudo guardar.';
}
