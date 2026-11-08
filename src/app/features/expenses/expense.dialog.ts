import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Expense, ExpenseCategory, RecurringAmountMode, RecurringPayment } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { PERIOD_OPTIONS } from '../payments/payments.helpers';
import { CATEGORY_OPTIONS, ExpenseFormValue, personalDataError, toExpenseInput, toRecurringInput } from './expenses.helpers';

const NAME_MAX_LENGTH = 80;

export interface ExpenseDialogData {
  establishmentId: string;
  today: string;
  /** Si viene uno, se edita en vez de agregar. */
  expense?: Expense;
  payment?: RecurringPayment;
}

function safeName(control: AbstractControl): ValidationErrors | null {
  const error = personalDataError(String(control.value ?? ''));
  return error ? { [error]: true } : null;
}

function amountRequired(group: AbstractControl): ValidationErrors | null {
  const { repeats, amountMode, amount } = group.getRawValue() as { repeats: boolean; amountMode: RecurringAmountMode; amount: string | number | null };
  return (!repeats || amountMode === 'fixed') && !(Number(amount) > 0) ? { amountRequired: true } : null;
}

/** Tres datos para un gasto común; lo demás solo aparece si se repite (F17 en Stitch). */
@Component({
  selector: 'app-expense-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Editar gasto' : 'Agregar gasto' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        @if (!editing) {
          <mat-button-toggle-group formControlName="repeats" aria-label="Frecuencia del gasto" class="toggle" hideSingleSelectionIndicator>
            <mat-button-toggle [value]="false">Una sola vez</mat-button-toggle>
            <mat-button-toggle [value]="true">Se repite</mat-button-toggle>
          </mat-button-toggle-group>
        }
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" [maxlength]="nameMax" />
          <mat-hint>No escribas nombres de pacientes ni de empleados, ni CURP, RFC, CLABE o número de cuenta.</mat-hint>
          @if (form.controls.name.hasError('account')) { <mat-error>Quita el número: aquí no se guardan cuentas ni tarjetas.</mat-error> }
          @else if (form.controls.name.hasError('personal')) { <mat-error>Quita el CURP o RFC: el nombre no debe identificar personas.</mat-error> }
          @else { <mat-error>Escribe un nombre.</mat-error> }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Categoría</mat-label>
          <mat-select formControlName="category">
            @for (c of categories; track c.value) { <mat-option [value]="c.value">{{ c.label }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (repeats) {
          <mat-button-toggle-group formControlName="amountMode" aria-label="Tipo de monto" class="toggle" hideSingleSelectionIndicator>
            <mat-button-toggle value="fixed">Monto exacto</mat-button-toggle>
            <mat-button-toggle value="variable">Varía cada periodo</mat-button-toggle>
          </mat-button-toggle-group>
        }
        <mat-form-field appearance="outline">
          <mat-label>{{ repeats && form.value.amountMode === 'variable' ? 'Monto aproximado en MXN (opcional)' : 'Monto en MXN' }}</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="amount" />
        </mat-form-field>
        @if (form.hasError('amountRequired') && form.controls.amount.touched) {
          <p class="field-error" role="alert">Escribe el monto{{ repeats ? ' o cambia a «Varía cada periodo»' : '' }}.</p>
        }
        <mat-form-field appearance="outline">
          <mat-label>{{ repeats ? 'Primer pago' : 'Fecha de pago' }}</mat-label>
          <input matInput type="date" formControlName="dueOn" />
          <mat-error>Elige una fecha.</mat-error>
        </mat-form-field>
        @if (repeats) {
          <mat-form-field appearance="outline">
            <mat-label>Cada cuándo</mat-label>
            <mat-select formControlName="periodMonths">
              @for (p of periods; track p.months) { <mat-option [value]="p.months">{{ p.label }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Termina (opcional)</mat-label>
            <input matInput type="date" formControlName="endsOn" />
          </mat-form-field>
        }
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">Guardar gasto</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
    .form mat-form-field { width: 100%; }
    .toggle { align-self: flex-start; margin-bottom: 8px; }
    .field-error { margin: 0 0 8px; font-size: 13px; color: #b91c1c; }
    mat-hint { white-space: normal; }
    mat-form-field:first-of-type { margin-bottom: 16px; }
  `],
})
export class ExpenseDialogComponent {
  readonly data = inject<ExpenseDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<ExpenseDialogComponent>);

  readonly nameMax = NAME_MAX_LENGTH;
  readonly categories = CATEGORY_OPTIONS;
  readonly periods = PERIOD_OPTIONS;
  readonly editing = !!(this.data.expense || this.data.payment);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      repeats: [!!this.data.payment],
      name: [this.data.expense?.name ?? this.data.payment?.name ?? '', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(NAME_MAX_LENGTH), safeName]],
      category: [(this.data.expense?.category ?? this.data.payment?.category ?? 'other') as ExpenseCategory, Validators.required],
      amountMode: [(this.data.payment?.amountMode ?? 'fixed') as RecurringAmountMode],
      amount: [this.initialAmount() as number | string | null],
      dueOn: [this.data.expense?.dueOn ?? this.data.payment?.firstDueOn ?? this.data.today, Validators.required],
      periodMonths: [this.data.payment?.periodMonths ?? 1],
      endsOn: [this.data.payment?.endsOn ?? ''],
    },
    { validators: amountRequired },
  );

  get repeats(): boolean {
    return this.form.controls.repeats.value;
  }

  private initialAmount(): number | null {
    const cents = this.data.expense?.amountCents ?? this.data.payment?.amountCents ?? null;
    return cents === null ? null : cents / 100;
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value: ExpenseFormValue = this.form.getRawValue();
    this.saving.set(true);
    this.request(value).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }

  private request(value: ExpenseFormValue): Observable<unknown> {
    const { expense, payment, establishmentId } = this.data;
    if (expense) return this.api.updateExpense(expense.id, toExpenseInput(value));
    if (payment) return this.api.updateRecurringPayment(payment.id, toRecurringInput(value));
    return this.repeats ? this.api.createRecurringPayment(establishmentId, toRecurringInput(value)) : this.api.createExpense(establishmentId, toExpenseInput(value));
  }
}
