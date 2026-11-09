import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { Expense, ExpenseMerge, MergeKeep } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { formatMoney } from '../payments/payments.helpers';
import { ExpensesData, mergeNeedsChoice, targetOptions } from './expenses.helpers';

export interface MergeExpenseData {
  /** El duplicado: se anula y pasa sus soportes al que se conserva. */
  expense: Expense;
  data: ExpensesData;
}

/**
 * Unir un gasto registrado dos veces (uno por formulario y otro desde un
 * soporte). Lado a lado; si monto o fecha no coinciden, la persona elige con
 * cuáles se queda. Se puede deshacer.
 */
@Component({
  selector: 'app-merge-expense-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatRadioModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Unir pagos duplicados</h2>
    <mat-dialog-content>
      <p class="muted">«{{ source.name }}» se anula y sus soportes pasan al pago que elijas. Lo puedes deshacer.</p>
      <mat-form-field appearance="outline" class="wide">
        <mat-label>Se conserva</mat-label>
        <mat-select [ngModel]="targetKey()" (ngModelChange)="targetKey.set($event)">
          @for (o of options(); track o.key) {
            <mat-option [value]="o.key">{{ o.likely ? '★ ' : '' }}{{ o.label }}</mat-option>
          }
        </mat-select>
        <mat-hint>★ mismo monto a pocos días.</mat-hint>
      </mat-form-field>

      @if (target(); as t) {
        <div class="compare" role="group" aria-label="Comparación">
          <div><span class="label">Duplicado</span><strong>{{ money(source.amountCents) }}</strong><span>{{ source.paidOn ? 'Pagado ' + source.paidOn : 'Sin pagar' }}</span></div>
          <div><span class="label">Se conserva</span><strong>{{ t.amountCents === null ? 'Sin monto' : money(t.amountCents) }}</strong><span>{{ t.paidOn ? 'Pagado ' + t.paidOn : 'Sin pagar' }}</span></div>
        </div>
        @if (needsChoice()) {
          <p class="choose">El monto o la fecha no coinciden. ¿Con cuáles se queda?</p>
          <mat-radio-group [ngModel]="keep()" (ngModelChange)="keep.set($event)" class="radios" aria-label="Con qué datos se queda">
            <mat-radio-button value="target">Los del pago que se conserva</mat-radio-button>
            <mat-radio-button value="source">Los del duplicado ({{ money(source.amountCents) }}{{ source.paidOn ? ', ' + source.paidOn : '' }})</mat-radio-button>
          </mat-radio-group>
        }
      }
      @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !target() || (needsChoice() && !keep())" (click)="merge()">Unir</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .wide { width: 100%; margin-top: 8px; }
    .muted { color: #475569; font-size: 14px; margin: 0; }
    .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
    .compare > div { display: flex; flex-direction: column; gap: 2px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; font-size: 14px; }
    .label { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; }
    .choose { font-size: 14px; margin: 8px 0; color: #92400e; }
    .radios { display: flex; flex-direction: column; gap: 4px; }
    .field-error { font-size: 13px; color: #b91c1c; }
  `],
})
export class MergeExpenseDialogComponent {
  readonly data = inject<MergeExpenseData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<MergeExpenseDialogComponent, ExpenseMerge>);

  readonly source = this.data.expense;
  readonly money = formatMoney;
  readonly options = computed(() =>
    targetOptions(
      this.data.data,
      (this.source.possibleDuplicateIds ?? []).map((expenseId) => ({ expenseId })),
      this.source.id,
    ),
  );
  readonly targetKey = signal(this.options().find((o) => o.likely)?.key ?? '');
  readonly target = computed(() => this.options().find((o) => o.key === this.targetKey()) ?? null);
  readonly needsChoice = computed(() => {
    const t = this.target();
    return !!t && mergeNeedsChoice(this.source, t);
  });
  readonly keep = signal<MergeKeep | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  merge(): void {
    const t = this.target();
    if (!t) return;
    this.saving.set(true);
    this.api.mergeExpense(this.source.id, t.target, this.needsChoice() ? this.keep() ?? undefined : undefined).subscribe({
      next: ({ merge }) => this.ref.close(merge),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
