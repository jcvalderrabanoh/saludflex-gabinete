import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ExpenseCategory, InventorySupplier, PaymentAttachment } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { confidenceLevel } from '../evidence/analyze-document.helpers';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { serviceLabel, toCents } from '../payments/payments.helpers';
import { CATEGORY_OPTIONS, PaymentSources, parseReferences, personalDataError, referencesError, targetOptions } from './expenses.helpers';
import { SupplierFieldComponent } from './supplier-field.component';

export interface ValidateAttachmentData {
  establishmentId: string;
  today: string;
  attachment: PaymentAttachment;
  /** Gastos y pagos recurrentes a los que se puede unir. */
  sources: PaymentSources;
  suppliers: InventorySupplier[];
  /** Quitar soportes pide facility.manage. */
  canManage: boolean;
  /** Registrar un gasto nuevo: Gastos encendido y facility.manage. */
  canRegister: boolean;
}

type Mode = 'new' | 'existing';

function safeName(control: AbstractControl): ValidationErrors | null {
  const error = personalDataError(String(control.value ?? ''));
  return error ? { [error]: true } : null;
}

function safeReferences(control: AbstractControl): ValidationErrors | null {
  return referencesError(parseReferences(String(control.value ?? ''))) ? { references: true } : null;
}

/**
 * Validar un soporte subido sin pago: la IA propuso el registro y la persona
 * lo confirma o corrige. Si ya existe el pago (capturado por formulario), se
 * une a ese en vez de registrar otro.
 */
@Component({
  selector: 'app-validate-attachment-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule, SupplierFieldComponent],
  template: `
    <h2 mat-dialog-title>Validar soporte de pago</h2>
    <mat-dialog-content>
      <div class="preview">
        @if (previewUrl(); as url) {
          @if (a.contentType === 'application/pdf') {
            <a mat-stroked-button [href]="url" target="_blank" rel="noopener">Ver PDF completo</a>
          } @else {
            <img [src]="url" alt="Vista previa del soporte" />
          }
        } @else { <span class="muted">Cargando vista previa…</span> }
      </div>

      @if (a.state === 'validating') {
        <p class="warn" role="status">Alguien empezó a validar este soporte y no terminó. Revisa en la lista si el pago ya quedó registrado antes de guardar otra vez.</p>
      }
      @if (a.state === 'failed') {
        <p class="warn" role="status">No se pudo leer el soporte. Captura los datos a mano.</p>
      }
      @if (a.state !== 'failed' && a.suggestion) {
        <p class="muted">La IA lo leyó como «{{ a.suggestion.documentType }}». Revisa cada dato antes de guardar.</p>
        @if (!a.suggestion.isPaymentDocument) { <p class="warn" role="status">No parece un soporte de pago. Revisa que sea el archivo correcto.</p> }
        @if (a.suggestion.currency && a.suggestion.currency !== 'MXN') { <p class="warn" role="status">Viene en {{ a.suggestion.currency }}: captura el monto en pesos.</p> }
      }

      @if (service(); as svc) {
        <p class="dup" role="status"><strong>Es de {{ svc }}.</strong> La IA reconoció su número de servicio o medidor. Revisa el periodo antes de guardar.</p>
      } @else if (duplicates().length > 0) {
        <p class="dup" role="status"><strong>Posible duplicado:</strong> ya hay un pago con el mismo monto a pocos días. Úneselo en vez de registrar otro.</p>
      }

      @if (data.canRegister) {
      <mat-button-toggle-group [value]="mode()" (change)="mode.set($event.value)" aria-label="Qué hacer con el soporte" class="toggle" hideSingleSelectionIndicator>
        <mat-button-toggle value="existing">Unir a un pago que ya existe</mat-button-toggle>
        <mat-button-toggle value="new">Registrar gasto nuevo</mat-button-toggle>
      </mat-button-toggle-group>
      }

      <form [formGroup]="form" class="form">
        @if (mode() === 'existing') {
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Pago</mat-label>
            <mat-select formControlName="target">
              @for (o of options(); track o.key) {
                <mat-option [value]="o.key">{{ o.likely ? '★ ' : '' }}{{ o.label }}</mat-option>
              }
            </mat-select>
            <mat-hint>★ el que reconoció la IA o mismo monto a pocos días.</mat-hint>
          </mat-form-field>
          <mat-checkbox class="wide" formControlName="markPaid">Ya está pagado: si seguía pendiente, márcalo pagado con esta fecha y monto</mat-checkbox>
        } @else {
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Nombre</mat-label>
            <input matInput formControlName="name" maxlength="80" />
            <mat-hint>{{ hint('name') }} Sin nombres de pacientes ni empleados, CURP, RFC, CLABE ni número de cuenta.</mat-hint>
            @if (form.controls.name.hasError('account')) { <mat-error>Quita el número: aquí no se guardan cuentas ni tarjetas.</mat-error> }
            @else if (form.controls.name.hasError('personal')) { <mat-error>Quita el CURP o RFC.</mat-error> }
            @else { <mat-error>Escribe un nombre.</mat-error> }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Categoría</mat-label>
            <mat-select formControlName="category">
              @for (c of categories; track c.value) { <mat-option [value]="c.value">{{ c.label }}</mat-option> }
            </mat-select>
            <mat-hint>{{ hint('category') }}</mat-hint>
          </mat-form-field>
          <app-supplier-field class="wide" [establishmentId]="data.establishmentId" [suppliers]="suppliers()" [canCreate]="data.canManage" [suggestedName]="a.suggestion?.supplierName ?? null" [control]="form.controls.supplierId" (created)="addSupplier($event)" />
        }
        @if (mode() === 'new' || form.controls.markPaid.value) {
        <mat-form-field appearance="outline">
          <mat-label>{{ mode() === 'existing' ? 'Monto pagado (MXN)' : 'Monto en MXN' }}</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="amount" />
          <mat-hint>{{ hint('amount') }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Fecha de pago</mat-label>
          <input matInput type="date" formControlName="paidOn" [max]="data.today" />
          <mat-hint>{{ hint('paidOn') }}</mat-hint>
        </mat-form-field>
        }
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Referencias</mat-label>
          <input matInput formControlName="references" />
          <mat-hint>Folio de factura, clave de rastreo o número de recibo, separados por coma. Nunca tarjeta, CLABE, RFC ni CURP.</mat-hint>
          <mat-error>{{ referencesProblem() }}</mat-error>
        </mat-form-field>
        @if (error()) { <p class="field-error wide" role="alert">{{ error() }}</p> }
      </form>
      <p class="legend">Registro interno; no es contabilidad ni comprobante fiscal.</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (data.canManage) { <button mat-button class="remove" [disabled]="saving()" (click)="remove()">Quitar soporte</button> }
      <span class="spacer"></span>
      <button mat-button mat-dialog-close>Después</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">{{ mode() === 'new' ? 'Registrar gasto' : form.controls.markPaid.value ? 'Unir y marcar pagado' : 'Adjuntar al pago' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .preview { display: flex; justify-content: center; margin-bottom: 12px; max-height: 280px; overflow: auto; background: #f8fafc; border-radius: 12px; padding: 8px; }
    .preview img { max-width: 100%; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 12px; padding-top: 12px; }
    .wide { grid-column: 1 / -1; }
    .toggle { margin-top: 8px; flex-wrap: wrap; }
    .warn, .dup { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: 14px; background: #fef3c7; color: #92400e; }
    .dup { background: #dbeafe; color: #1e3a8a; }
    .muted { color: #475569; font-size: 14px; margin: 8px 0 0; }
    .legend { color: #475569; font-size: 12px; margin: 12px 0 0; }
    .field-error { margin: 0; font-size: 13px; color: #b91c1c; }
    .remove { color: #b91c1c; }
    .spacer { flex: 1; }
    mat-hint { white-space: normal; }
    @media (max-width: 640px) { .form { grid-template-columns: 1fr; } }
  `],
})
export class ValidateAttachmentDialogComponent implements OnDestroy {
  readonly data = inject<ValidateAttachmentData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<ValidateAttachmentDialogComponent>);

  readonly a = this.data.attachment;
  readonly categories = CATEGORY_OPTIONS;
  readonly previewUrl = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly suppliers = signal(this.data.suppliers);
  readonly duplicates = computed(() => this.a.possibleDuplicates ?? []);
  readonly options = computed(() => targetOptions(this.data.sources, this.duplicates()));
  readonly mode = signal<Mode>(this.duplicates().length > 0 || !this.data.canRegister ? 'existing' : 'new');
  /** El servicio que la IA reconoció por su número de medidor o servicio. */
  readonly service = computed(() => {
    const target = this.a.suggestion?.suggestedTarget;
    const payment = target && this.data.sources.overview.payments.find((p) => p.id === target.recurringPaymentId);
    return payment ? `${serviceLabel(payment)}, periodo ${target.dueOn}` : null;
  });

  private readonly s = this.a.suggestion;
  readonly form = inject(FormBuilder).nonNullable.group({
    target: [this.options().find((o) => o.likely)?.key ?? ''],
    name: [this.s?.name ?? '', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(80), safeName]],
    category: [(this.s?.category ?? 'other') as ExpenseCategory],
    supplierId: [this.s?.supplierId ?? ''],
    amount: [(this.s?.amountCents ?? null) === null ? null : (this.s?.amountCents as number) / 100] as [number | string | null],
    paidOn: [this.s?.paidOn ?? this.data.today, Validators.required],
    // Un recibo con fecha de pago ya está pagado; uno con solo fecha límite, no.
    markPaid: [!!this.s?.paidOn || !this.s],
    references: [(this.a.references.length ? this.a.references : this.s?.references ?? []).join(', '), safeReferences],
  });

  constructor() {
    if (this.a.hasFile) {
      this.api.paymentAttachmentFile(this.a.id).subscribe((blob) => this.previewUrl.set(URL.createObjectURL(blob)));
    }
  }

  ngOnDestroy(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  /** La confianza de la IA en ese dato, si la propuso. */
  hint(field: 'name' | 'category' | 'amount' | 'paidOn'): string {
    const s = this.s;
    if (!s) return '';
    if (field === 'name') return s.name ? 'Propuesto por la IA.' : '';
    const value = { category: s.categoryConfidence, amount: s.amountConfidence, paidOn: s.paidOnConfidence }[field];
    if (!value) return '';
    return `Propuesto por la IA: ${confidenceLevel(Math.round(value * 100)).label.toLowerCase()}.`;
  }

  referencesProblem(): string {
    return referencesError(parseReferences(this.form.controls.references.value)) ?? '';
  }

  addSupplier(supplier: InventorySupplier): void {
    this.suppliers.update((list) => [...list, supplier].sort((x, y) => x.name.localeCompare(y.name)));
    this.form.controls.supplierId.setValue(supplier.id);
  }

  save(): void {
    const { controls } = this.form;
    const fields = this.mode() === 'new' ? [controls.name, controls.category, controls.amount, controls.paidOn, controls.references] : [controls.target, controls.paidOn, controls.references];
    fields.forEach((c) => c.markAsTouched());
    if (fields.some((c) => c.invalid)) return;
    const references = parseReferences(controls.references.value);
    const cents = toCents(controls.amount.value);
    let request: Observable<unknown>;
    if (this.mode() === 'new') {
      if (!cents) {
        this.error.set('Escribe el monto.');
        return;
      }
      request = this.api.registerAttachmentExpense(this.a.id, {
        name: controls.name.value.trim(),
        category: controls.category.value,
        amountCents: cents,
        paidOn: controls.paidOn.value,
        supplierId: controls.supplierId.value || undefined,
        references,
      });
    } else {
      const option = this.options().find((o) => o.key === controls.target.value);
      if (!option) {
        this.error.set('Elige el pago al que corresponde.');
        return;
      }
      const paid = controls.markPaid.value;
      request = this.api.attachToPayment(this.a.id, {
        ...option.target,
        markPaid: paid,
        paidOn: paid ? controls.paidOn.value : undefined,
        paidCents: paid && option.target.recurringPaymentId && cents ? cents : undefined,
        references,
      });
    }
    this.submit(request);
  }

  remove(): void {
    if (!confirm('¿Quitar este soporte? Se borra el archivo.')) return;
    this.submit(this.api.removePaymentAttachment(this.a.id));
  }

  private submit(request: Observable<unknown>): void {
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
