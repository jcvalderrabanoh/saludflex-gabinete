import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, concatMap, from, of, toArray } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { InventorySupplier, PaymentAttachment } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { serviceLabel } from '../payments/payments.helpers';
import { ATTACHMENT_STATE_LABEL, PaymentSources, suggestionSummary } from './expenses.helpers';
import { ValidateAttachmentData, ValidateAttachmentDialogComponent } from './validate-attachment.dialog';

/** Abre un soporte en otra pestaña (el archivo no se guarda en el navegador). */
export function openAttachmentFile(api: FacilityApiService, id: string, onError: (message: string) => void): void {
  api.paymentAttachmentFile(id).subscribe({
    next: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    error: (err: HttpErrorResponse) => onError(apiMessage(err)),
  });
}

/**
 * Dónde se suben los recibos y comprobantes de pago, pagados o por pagar
 * (Gastos y Pagos recurrentes). La IA lee cada uno y propone a qué pago y
 * periodo va; la persona lo confirma en «Por validar».
 */
@Component({
  selector: 'app-payment-uploads',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <section class="pending" aria-labelledby="uploads-title">
      <div class="top">
        <div>
          <h2 id="uploads-title">Recibos y comprobantes de pago @if (pending.length > 0) { <span class="count">{{ pending.length }} por validar</span> }</h2>
          <p class="reading">Sube recibos pagados o por pagar (luz, agua, renta, facturas, transferencias). La IA los lee y propone a qué pago y periodo van; tú confirmas. Para pegarlo directo a un pago, usa «Adjuntar recibo» en su renglón.</p>
        </div>
        <input #files type="file" hidden multiple accept="application/pdf,image/*" (change)="upload(files.files); files.value = ''" />
        <button mat-flat-button color="primary" class="upload" [disabled]="uploading()" (click)="files.click()"><mat-icon>upload_file</mat-icon> {{ uploading() ? 'Subiendo…' : 'Subir recibos o comprobantes' }}</button>
      </div>
      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (pending.length > 0) {
        <ul class="list">
          @for (a of pending; track a.id) {
            <li class="att">
              <mat-icon aria-hidden="true">{{ a.contentType === 'application/pdf' ? 'picture_as_pdf' : 'image' }}</mat-icon>
              <div class="name">
                <span class="title">{{ summary(a) || 'Recibo o comprobante' }}</span>
                <span class="meta">{{ stateLabel[a.state] }}
                  @if (serviceOf(a); as service) { · <strong class="dup">es de {{ service }}</strong> }
                  @else if ((a.possibleDuplicates?.length ?? 0) > 0) { · <strong class="dup">posible duplicado</strong> }
                </span>
              </div>
              <button mat-button (click)="open(a.id)">Ver</button>
              @if (a.state === 'review' || a.state === 'failed' || a.state === 'validating') {
                <button mat-stroked-button (click)="validate(a)">Validar</button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .pending { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px 20px; margin: 16px 0; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .upload { flex: none; }
    h2 { display: flex; align-items: center; gap: 8px; font-size: 16px; color: #1e3a8a; margin: 0 0 4px; }
    .count { font-size: 12px; font-weight: 600; color: #1e3a8a; background: #dbeafe; border-radius: 10px; padding: 0 8px; }
    .reading { margin: 0; font-size: 13px; color: #475569; max-width: 75ch; }
    .notice { background: #dbeafe; color: #1e3a8a; border-radius: 8px; padding: 8px 12px; font-size: 14px; margin: 12px 0 0; }
    .error { color: #b91c1c; font-size: 14px; margin: 12px 0 0; }
    .list { list-style: none; margin: 12px 0 0; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; }
    .att { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid #e2e8f0; }
    .att:first-child { border-top: 0; }
    .att mat-icon { color: #475569; flex: none; }
    .name { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .title { font-weight: 700; font-size: 14px; color: #0f172a; }
    .meta { font-size: 13px; color: #475569; }
    .dup { color: #1e3a8a; }
    @media (max-width: 640px) { .top { flex-direction: column; } }
  `],
})
export class PaymentUploadsComponent {
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);

  @Input({ required: true }) establishmentId!: string;
  @Input({ required: true }) today!: string;
  @Input() pending: PaymentAttachment[] = [];
  @Input({ required: true }) sources!: PaymentSources;
  @Input() suppliers: InventorySupplier[] = [];
  /** Registrar un gasto nuevo: Gastos encendido y facility.manage. */
  @Input() canRegister = false;
  @Input() canManage = false;
  /** Algo cambió (subida o validación): quien contiene recarga. */
  @Output() readonly changed = new EventEmitter<void>();

  readonly uploading = signal(false);
  readonly notice = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly stateLabel = ATTACHMENT_STATE_LABEL;
  readonly summary = (a: PaymentAttachment) => suggestionSummary(a.suggestion);

  /** El servicio que la IA reconoció por su número de medidor o servicio. */
  serviceOf(a: PaymentAttachment): string | null {
    const target = a.suggestion?.suggestedTarget;
    const payment = target && this.sources.overview.payments.find((p) => p.id === target.recurringPaymentId);
    return payment ? `${serviceLabel(payment)} (periodo ${target.dueOn})` : null;
  }

  /** Uno por petición: la IA los lee en segundo plano. */
  upload(list: FileList | null): void {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    this.uploading.set(true);
    this.error.set(null);
    from(files)
      .pipe(
        concatMap((file) =>
          this.api.uploadPaymentAttachment(this.establishmentId, file).pipe(catchError((err: HttpErrorResponse) => of({ failed: `${file.name}: ${apiMessage(err)}` }))),
        ),
        toArray(),
      )
      .subscribe((results) => {
        this.uploading.set(false);
        const failed = results.filter((r): r is { failed: string } => 'failed' in r);
        const repeated = results.filter((r) => 'duplicate' in r && r.duplicate).length;
        const ok = results.length - failed.length;
        if (ok > 0) {
          this.notice.set(
            `${ok === 1 ? 'Se subió 1 recibo' : `Se subieron ${ok} recibos`}; la IA los está leyendo.${repeated ? ` ${repeated} ya estaba${repeated === 1 ? '' : 'n'} subido${repeated === 1 ? '' : 's'}.` : ''}`,
          );
        }
        if (failed.length) this.error.set(failed.join(' · '));
        this.changed.emit();
      });
  }

  open(id: string): void {
    openAttachmentFile(this.api, id, (message) => this.error.set(message));
  }

  validate(attachment: PaymentAttachment): void {
    const data: ValidateAttachmentData = {
      establishmentId: this.establishmentId,
      today: this.today,
      attachment,
      sources: this.sources,
      suppliers: this.suppliers,
      canManage: this.canManage,
      canRegister: this.canRegister,
    };
    this.dialog
      .open(ValidateAttachmentDialogComponent, { width: '640px', data })
      .afterClosed()
      .subscribe((saved) => saved && this.changed.emit());
  }
}
