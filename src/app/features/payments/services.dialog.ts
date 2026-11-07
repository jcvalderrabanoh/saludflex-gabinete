import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RecurringAmountMode, RecurringPayment, RecurringPaymentKind } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { PERIOD_OPTIONS, ServiceFormValue, toPaymentInput, unusedSuggestions } from './payments.helpers';

export interface ServicesDialogData {
  establishmentId: string;
  followedNames: string[];
  /** Si viene, se edita este servicio en vez de elegir nuevos. */
  editing?: RecurringPayment;
}

/** Ocho o más dígitos seguidos parecen cuenta, CLABE o tarjeta; jc-core los rechaza igual. */
const ACCOUNT_LIKE_DIGITS = /(\d[\s-]*){8,}/;

function noAccountNumbers(control: AbstractControl): ValidationErrors | null {
  return ACCOUNT_LIKE_DIGITS.test(String(control.value ?? '')) ? { accountLike: true } : null;
}

function fixedNeedsAmount(group: AbstractControl): ValidationErrors | null {
  const { amountMode, amount } = group.value as ServiceFormValue;
  return amountMode === 'fixed' && !Number(amount) ? { amountRequired: true } : null;
}

@Component({
  selector: 'app-services-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.editing ? 'Editar ' + data.editing.name : 'Elegir servicios' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <p class="hint">No escribas número de cuenta, CLABE, tarjeta ni RFC. Aquí solo registras; pagas directo a tu proveedor.</p>
        <div formArrayName="rows">
          @for (row of rows.controls; track row; let i = $index) {
            <fieldset [formGroupName]="i" class="row">
              @if (row.value.suggested) {
                <mat-checkbox formControlName="selected">{{ row.value.name }}</mat-checkbox>
              } @else if (!data.editing) {
                <div class="custom-head">
                  <span>Otro servicio o suscripción</span>
                  <button mat-icon-button type="button" (click)="removeRow(i)" aria-label="Quitar este servicio"><mat-icon>close</mat-icon></button>
                </div>
              }
              @if (row.value.selected) {
                <div class="fields">
                  @if (!row.value.suggested) {
                    <mat-form-field appearance="outline" class="wide">
                      <mat-label>Nombre</mat-label>
                      <input matInput formControlName="name" maxlength="120" placeholder="Internet, renta, software" />
                      @if (row.get('name')?.hasError('accountLike')) {
                        <mat-error>Quita el número: aquí no se guardan cuentas ni tarjetas.</mat-error>
                      }
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Tipo</mat-label>
                      <mat-select formControlName="kind">
                        <mat-option value="service">Servicio</mat-option>
                        <mat-option value="subscription">Suscripción</mat-option>
                      </mat-select>
                    </mat-form-field>
                  }
                  <mat-form-field appearance="outline">
                    <mat-label>Cada cuándo</mat-label>
                    <mat-select formControlName="periodMonths">
                      @for (p of periods; track p.months) { <mat-option [value]="p.months">{{ p.label }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>{{ data.editing ? 'Primer pago' : 'Próximo pago' }}</mat-label>
                    <input matInput type="date" formControlName="firstDueOn" />
                    <mat-error>Elige una fecha.</mat-error>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Monto</mat-label>
                    <mat-select formControlName="amountMode">
                      <mat-option value="fixed">Fijo</mat-option>
                      <mat-option value="variable">Varía cada periodo</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>{{ row.value.amountMode === 'fixed' ? 'Monto en MXN' : 'Aprox. MXN (opcional)' }}</mat-label>
                    <input matInput type="number" min="0" step="0.01" formControlName="amount" />
                  </mat-form-field>
                  @if (row.hasError('amountRequired') && row.touched) {
                    <p class="field-error wide" role="alert">Escribe el monto fijo o cambia a «Varía cada periodo».</p>
                  }
                </div>
              }
            </fieldset>
          }
        </div>
        @if (!data.editing) {
          <button mat-stroked-button type="button" (click)="addCustom()"><mat-icon>add</mat-icon> Agregar otro servicio o suscripción</button>
        }
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || selectedCount() === 0" (click)="save()">{{ saveLabel() }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; padding-top: 4px; }
    .form > div { width: 100%; }
    .row { border: 0; border-bottom: 1px solid #e2e8f0; margin: 0; padding: 8px 0; min-width: 0; }
    .custom-head { display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-size: 14px; }
    .fields { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; margin-top: 8px; }
    .wide { grid-column: 1 / -1; }
    .hint { margin: 0; font-size: 13px; color: #475569; }
    .field-error { margin: 0 0 8px; font-size: 13px; color: #b91c1c; }
    @media (max-width: 640px) { .fields { grid-template-columns: 1fr; } }
  `],
})
export class ServicesDialogComponent {
  readonly data = inject<ServicesDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<ServicesDialogComponent>);
  private readonly fb = inject(FormBuilder);

  readonly periods = PERIOD_OPTIONS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({ rows: this.fb.array<FormGroup>([]) });
  private readonly version = signal(0);
  readonly selectedCount = computed(() => {
    this.version();
    return this.selectedRows().length;
  });

  constructor() {
    if (this.data.editing) this.rows.push(this.editRow(this.data.editing));
    else unusedSuggestions(this.data.followedNames).forEach((s) => this.rows.push(this.newRow(s.name, s.periodMonths, s.amountMode, true)));
    this.form.valueChanges.subscribe(() => this.version.update((v) => v + 1));
  }

  get rows(): FormArray<FormGroup> {
    return this.form.controls.rows;
  }

  saveLabel(): string {
    if (this.saving()) return 'Guardando…';
    return this.data.editing ? 'Guardar cambios' : 'Guardar servicios';
  }

  addCustom(): void {
    this.rows.push(this.newRow('', 1, 'variable', false));
  }

  removeRow(index: number): void {
    this.rows.removeAt(index);
  }

  save(): void {
    const selected = this.selectedRows();
    selected.forEach((row) => row.markAllAsTouched());
    if (selected.some((row) => row.invalid)) return;
    const inputs = selected.map((row) => toPaymentInput(row.getRawValue() as ServiceFormValue));
    this.saving.set(true);
    this.error.set(null);
    const editing = this.data.editing;
    const requests = editing
      ? [this.api.updateRecurringPayment(editing.id, inputs[0])]
      : inputs.map((input) => this.api.createRecurringPayment(this.data.establishmentId, input));
    forkJoin(requests).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }

  private selectedRows(): FormGroup[] {
    return this.rows.controls.filter((row) => row.value.selected);
  }

  private newRow(name: string, periodMonths: number, amountMode: RecurringAmountMode, suggested: boolean, kind: RecurringPaymentKind = 'service'): FormGroup {
    return this.fb.group(
      {
        suggested: [suggested],
        selected: [!suggested],
        name: [name, [Validators.required, Validators.pattern(/\S/), noAccountNumbers]],
        kind: [kind],
        periodMonths: [periodMonths],
        firstDueOn: ['', Validators.required],
        amountMode: [amountMode],
        amount: [null as number | null, Validators.min(0)],
      },
      { validators: fixedNeedsAmount },
    );
  }

  private editRow(payment: RecurringPayment): FormGroup {
    const row = this.newRow(payment.name, payment.periodMonths, payment.amountMode, false, payment.kind);
    row.patchValue({ firstDueOn: payment.firstDueOn, amount: payment.amountCents === null ? null : payment.amountCents / 100 });
    return row;
  }
}
