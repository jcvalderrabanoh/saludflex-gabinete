import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { catchError, map, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { PaymentAttachment, RecurringPayment, RecurringPaymentsOverview } from '../../core/models/facility.models';
import { PaymentUploadsComponent, openAttachmentFile } from '../expenses/payment-uploads.component';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { MarkPaidData, MarkPaidDialogComponent } from './mark-paid.dialog';
import { PaymentLine, amountLabel, formatMoney, paymentSections, periodLabel } from './payments.helpers';
import { ServicesDialogComponent, ServicesDialogData } from './services.dialog';

const DATE = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Servicios y suscripciones que se pagan cada periodo (F13 en Stitch). Solo registra. */
@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, PaymentUploadsComponent],
  template: `
    <header class="head">
      <div>
        <h1>Pagos recurrentes @if (context.current(); as e) { <span class="place">· {{ e.name }}</span> }</h1>
        <p class="sub">Registra lo que pagas cada periodo y consulta qué sigue. No paga, no cobra y no guarda datos bancarios; pagas directo a tu proveedor.</p>
      </div>
      @if (permissions.can('manage') && overview()) {
        <button mat-stroked-button (click)="chooseServices()"><mat-icon>tune</mat-icon> Elegir servicios o medidores</button>
      }
    </header>

    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (overview(); as o) {
      @if (context.current(); as e) {
        <app-payment-uploads
          [establishmentId]="e.id"
          [today]="o.today"
          [pending]="pending()"
          [sources]="{ expenses: [], overview: o }"
          [canManage]="permissions.can('manage')"
          [canRegister]="false"
          (changed)="reload()"
        />
      }
    }
    <input #attachFile type="file" hidden accept="application/pdf,image/*" (change)="attachTo(attachFile.files); attachFile.value = ''" />

    @if (overview(); as o) {
      @if (o.payments.length === 0) {
        <section class="empty">
          <h2>¿Qué pagas cada periodo?</h2>
          <p>Elige entre predial, luz, gas, agua y teléfono, o agrega otros servicios y suscripciones, con monto fijo o variable.</p>
          @if (permissions.can('manage')) {
            <button mat-flat-button color="primary" (click)="chooseServices()">Elegir servicios</button>
          } @else {
            <p class="muted">Pide a quien administra el gabinete que elija los servicios.</p>
          }
        </section>
      } @else {
        @for (section of visibleSections(); track section.title) {
          <section class="section">
            <h2>{{ section.title }} <span class="count">{{ section.lines.length }}</span></h2>
            <ul class="list">
              @for (line of section.lines; track line.payment.id + line.dueOn) {
                <li class="line">
                  <mat-icon class="kind" aria-hidden="true">{{ line.payment.kind === 'subscription' ? 'autorenew' : 'receipt_long' }}</mat-icon>
                  <div class="name">
                    <span class="title">{{ line.payment.name }}</span>
                    @if (line.payment.reference) { <span class="meta">Servicio o medidor {{ line.payment.reference }}</span> }
                    @if (periodAttachments(line).length > 0) {
                      <span class="meta">Recibo de este periodo:
                        @for (f of periodAttachments(line); track f.id) {
                          <button class="undo" type="button" (click)="openAttachment(f.id)">Ver{{ f.references.length ? ' ' + f.references.join(', ') : '' }}</button>
                        }
                      </span>
                    }
                    <span class="meta">{{ period(line.payment.periodMonths) }} · {{ line.payment.kind === 'subscription' ? 'Suscripción' : 'Servicio' }}</span>
                    @if (line.dueOn === line.payment.next && line.payment.lastPaid; as last) {
                      <span class="meta">Último pago {{ date(last.paidOn) }}@if (last.paidCents !== null) { · {{ money(last.paidCents) }} }
                        <button class="undo" type="button" [disabled]="busy()" (click)="undo(line.payment)">Deshacer</button>
                        @for (f of last.attachments ?? []; track f.id) {
                          <button class="undo" type="button" (click)="openAttachment(f.id)">Ver soporte{{ f.references.length ? ' ' + f.references.join(', ') : '' }}</button>
                        }
                        <button class="undo" type="button" [disabled]="busy()" (click)="pickAttachment(line.payment.id, last.dueOn)">Adjuntar recibo del último pago</button>
                      </span>
                    }
                  </div>
                  <div class="due">{{ date(line.dueOn) }}</div>
                  <div class="amount">{{ amount(line.payment) }}</div>
                  <span class="chip" [class.overdue]="section.key === 'overdue'">{{ section.key === 'overdue' ? 'Vencido' : 'Por pagar' }}</span>
                  <button mat-stroked-button [disabled]="busy()" (click)="markPaid(line)"><mat-icon>check</mat-icon> Marcar como pagado</button>
                  <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'Más acciones de ' + line.payment.name"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #menu="matMenu">
                    <button mat-menu-item (click)="pickAttachment(line.payment.id, line.dueOn)"><mat-icon>attach_file</mat-icon> Adjuntar recibo de este periodo</button>
                    <button mat-menu-item (click)="skip(line)"><mat-icon>event_busy</mat-icon> Omitir este periodo</button>
                    @if (permissions.can('manage')) {
                      <button mat-menu-item (click)="edit(line.payment)"><mat-icon>edit</mat-icon> Editar</button>
                      <button mat-menu-item (click)="stopFollowing(line.payment)"><mat-icon>remove_circle_outline</mat-icon> Dejar de seguir</button>
                    }
                  </mat-menu>
                </li>
              }
            </ul>
          </section>
        }
      }
    }
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 8px; }
    .head button { flex: none; }
    h1 { margin: 0; } .place { color: #475569; font-weight: 500; }
    .sub { margin: 4px 0 16px; color: #475569; font-size: 14px; max-width: 70ch; }
    .section { margin-top: 24px; }
    h2 { display: flex; align-items: center; gap: 8px; font-size: 16px; color: #1e3a8a; margin: 0 0 8px; }
    .count { font-size: 12px; font-weight: 600; color: #475569; background: #e2e8f0; border-radius: 10px; padding: 0 8px; }
    .list { list-style: none; margin: 0; padding: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .line { display: grid; grid-template-columns: 24px minmax(160px, 1fr) 104px 168px 80px auto 40px; align-items: center; gap: 12px; padding: 12px 16px; border-top: 1px solid #e2e8f0; }
    .line:first-child { border-top: 0; }
    .kind { color: #475569; }
    .name { display: flex; flex-direction: column; min-width: 0; }
    .title { font-weight: 700; font-size: 14px; color: #0f172a; }
    .meta { font-size: 13px; color: #475569; }
    .due, .amount { font-size: 14px; color: #0f172a; font-variant-numeric: tabular-nums; }
    .chip { justify-self: start; font-size: 12px; font-weight: 600; border-radius: 12px; padding: 2px 10px; background: #fef3c7; color: #92400e; white-space: nowrap; }
    .chip.overdue { background: #fee2e2; color: #991b1b; }
    .undo { border: 0; background: none; padding: 0 0 0 4px; font: inherit; color: #1d4ed8; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
    .undo:disabled { color: #64748b; cursor: default; }
    .empty { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-top: 16px; }
    .empty p { max-width: 65ch; color: #475569; font-size: 14px; }
    .muted { color: #475569; }
    .error { color: #b91c1c; font-size: 14px; }
    @media (max-width: 1100px) {
      .line { grid-template-columns: 24px 1fr auto; }
      .due, .amount, .chip { grid-column: 2 / -1; justify-self: start; }
      .line > button[mat-stroked-button] { grid-column: 2; justify-self: start; }
    }
    @media (max-width: 640px) { .head { flex-direction: column; gap: 8px; } }
  `],
})
export class PaymentsComponent implements OnDestroy {
  readonly context = inject(EstablishmentContextService);
  readonly permissions = inject(PermissionsService);
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);
  @ViewChild('attachFile') private attachInput?: ElementRef<HTMLInputElement>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  /** El periodo al que va el recibo que se elija (pagado, vencido o por pagar). */
  private attachPeriod: { recurringPaymentId: string; dueOn: string } | null = null;

  readonly overview = signal<RecurringPaymentsOverview | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  /** Recibos subidos sin pago, por leer o validar. */
  readonly pending = signal<PaymentAttachment[]>([]);

  readonly visibleSections = computed(() => {
    const o = this.overview();
    if (!o) return [];
    const { overdue, soon, later } = paymentSections(o.payments, o.today);
    return [
      { key: 'overdue', title: 'Vencidos', lines: overdue },
      { key: 'soon', title: 'Próximos 30 días', lines: soon },
      { key: 'later', title: 'Más adelante', lines: later },
    ].filter((s) => s.lines.length > 0);
  });

  constructor() {
    effect(() => {
      const e = this.context.current();
      if (e) this.load(e.id);
    });
  }

  private load(id: string): void {
    this.api.recurringPayments(id).subscribe({
      next: (o) => {
        this.overview.set(o);
        this.error.set(null);
      },
      error: (err: HttpErrorResponse) => this.error.set(`No pudimos cargar tus pagos. ${apiMessage(err)}`),
    });
    // Sin la lista de recibos la pantalla sigue sirviendo.
    this.api
      .pendingPaymentAttachments(id)
      .pipe(catchError(() => of([] as PaymentAttachment[])))
      .subscribe((pending) => {
        this.pending.set(pending);
        this.scheduleRefresh();
      });
  }

  reload(): void {
    const id = this.context.current()?.id;
    if (id) this.load(id);
  }

  date(value: string): string {
    return DATE.format(new Date(`${value}T00:00:00Z`)).replaceAll('.', '');
  }
  period = periodLabel;
  amount = amountLabel;
  money = formatMoney;

  chooseServices(): void {
    this.openServices();
  }

  edit(payment: RecurringPayment): void {
    this.openServices(payment);
  }

  private openServices(editing?: RecurringPayment): void {
    const establishment = this.context.current();
    const overview = this.overview();
    if (!establishment || !overview) return;
    const data: ServicesDialogData = {
      establishmentId: establishment.id,
      followedNames: overview.payments.map((p) => p.name),
      editing,
    };
    this.dialog
      .open(ServicesDialogComponent, { width: '640px', data })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  /** Monto fijo: un clic y se puede deshacer. Variable: pregunta cuánto. */
  markPaid(line: PaymentLine): void {
    const { payment, dueOn } = line;
    if (payment.amountMode === 'fixed' && payment.amountCents !== null) {
      this.run(this.api.markPaymentPaid(payment.id, { dueOn, paidCents: payment.amountCents }));
      return;
    }
    const data: MarkPaidData = { paymentId: payment.id, name: payment.name, dueOn, today: this.overview()?.today ?? dueOn };
    this.dialog
      .open(MarkPaidDialogComponent, { width: '420px', data })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  /** El soporte (recibo, transferencia) del último pago: se adjunta sin pasar por la IA. */
  pickAttachment(recurringPaymentId: string, dueOn: string): void {
    this.attachPeriod = { recurringPaymentId, dueOn };
    this.attachInput?.nativeElement.click();
  }

  attachTo(list: FileList | null): void {
    const id = this.context.current()?.id;
    const file = list?.[0];
    const period = this.attachPeriod;
    this.attachPeriod = null;
    if (!id || !file || !period) return;
    this.run(this.api.uploadPaymentAttachment(id, file, period).pipe(map(() => undefined)));
  }

  openAttachment(attachmentId: string): void {
    openAttachmentFile(this.api, attachmentId, (message) => this.error.set(message));
  }

  /** Recibos de ese periodo (por pagar o vencido). */
  periodAttachments(line: PaymentLine) {
    return (line.payment.unpaidAttachments ?? []).filter((a) => a.dueOn === line.dueOn);
  }

  skip(line: PaymentLine): void {
    if (!confirm(`¿Omitir el periodo del ${this.date(line.dueOn)} de ${line.payment.name}? Deja de deberse sin contar como pago.`)) return;
    this.run(this.api.skipPaymentPeriod(line.payment.id, line.dueOn));
  }

  /** Mientras la IA lee algún recibo, vuelve a consultar en unos segundos. */
  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    if (!this.pending().some((a) => a.state === 'queued' || a.state === 'reading')) return;
    this.refreshTimer = setTimeout(() => this.reload(), 5000);
  }

  ngOnDestroy(): void {
    clearTimeout(this.refreshTimer);
  }

  undo(payment: RecurringPayment): void {
    if (payment.lastPaid) this.run(this.api.unmarkPaymentPaid(payment.id, payment.lastPaid.dueOn));
  }

  stopFollowing(payment: RecurringPayment): void {
    if (!confirm(`¿Dejar de seguir ${payment.name}? Ya no aparecerá en esta lista.`)) return;
    this.run(this.api.deleteRecurringPayment(payment.id));
  }

  private run(request: ReturnType<FacilityApiService['deleteRecurringPayment']>): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
