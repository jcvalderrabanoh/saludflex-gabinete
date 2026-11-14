import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { DocumentValidityInput, EvaluatedObligation } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

/** De dónde sale el vencimiento: la fecha del documento, N meses tras expedirse, o no vence. */
export type ValidityMode = 'document' | 'months' | 'none';

export interface ValidityChoice {
  mode: ValidityMode;
  months: number | null;
}

export interface DocumentValidityData {
  obligation: EvaluatedObligation;
}

/** El mismo límite que el backend (`periodEvery` de 1 a 120). */
const MAX_MONTHS = 120;

export function initialValidity(o: EvaluatedObligation): ValidityChoice {
  if (o.noExpiry) return { mode: 'none', months: null };
  if (o.period?.unit === 'month') return { mode: 'months', months: o.period.every };
  return { mode: 'document', months: null };
}

export function validityError(choice: ValidityChoice): string | null {
  if (choice.mode !== 'months') return null;
  if (!choice.months || choice.months < 1) return 'Indica cuántos meses dura.';
  if (!Number.isInteger(choice.months) || choice.months > MAX_MONTHS) return `La vigencia va de 1 a ${MAX_MONTHS} meses.`;
  return null;
}

export function validityPayload(choice: ValidityChoice): DocumentValidityInput {
  if (choice.mode === 'none') return { noExpiry: true };
  if (choice.mode === 'months') return { periodUnit: 'month', periodEvery: choice.months, noExpiry: false };
  return { periodUnit: null, periodEvery: null, noExpiry: false };
}

/**
 * Hasta cuándo vale un documento (licencia, permiso, contrato) cuando no trae
 * fecha de vencimiento: sin definirlo, queda «Sin vigencia» y no avisa.
 */
@Component({
  selector: 'app-document-validity-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Vigencia del documento</h2>
    <mat-dialog-content>
      <p class="what"><strong>{{ data.obligation.title }}</strong>@if (data.obligation.subjectLabel) { · {{ data.obligation.subjectLabel }} }</p>
      <p class="hint">Si el documento trae fecha de vencimiento, esa manda cuando es más cercana.</p>
      <mat-radio-group class="options" [value]="mode()" (change)="mode.set($event.value)" aria-label="De dónde sale el vencimiento">
        <mat-radio-button value="document">Usar la fecha de vencimiento del documento</mat-radio-button>
        <mat-radio-button value="months">Vence un número de meses después de expedirse</mat-radio-button>
        <mat-radio-button value="none">No vence (en tu estado o municipio no tiene vigencia)</mat-radio-button>
      </mat-radio-group>
      @if (mode() === 'months') {
        <mat-form-field appearance="outline" class="months">
          <mat-label>Meses de vigencia</mat-label>
          <input matInput type="number" min="1" max="120" step="1" [value]="months() ?? ''" (input)="months.set(toNumber($any($event.target).value))" />
          <mat-hint>Por ejemplo, 24 si dura 2 años.</mat-hint>
        </mat-form-field>
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
        {{ saving() ? 'Guardando…' : 'Guardar vigencia' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .what { margin: 0 0 4px; } .hint { margin: 0 0 12px; color: #6b7684; font-size: 14px; }
    .options { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .months { width: 220px; max-width: 100%; }
    .error { color: #b4232c; font-size: 14px; }
  `],
})
export class DocumentValidityDialogComponent {
  readonly data = inject<DocumentValidityData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DocumentValidityDialogComponent, boolean>);
  private readonly api = inject(FacilityApiService);
  private readonly initial = initialValidity(this.data.obligation);
  readonly mode = signal<ValidityMode>(this.initial.mode);
  readonly months = signal<number | null>(this.initial.months);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  toNumber(value: string): number | null {
    return value === '' ? null : Number(value);
  }

  save(): void {
    const choice = { mode: this.mode(), months: this.months() };
    const problem = validityError(choice);
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api.setDocumentValidity(this.data.obligation.id, validityPayload(choice)).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
