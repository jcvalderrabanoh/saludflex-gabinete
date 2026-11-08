import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription, forkJoin, map, switchMap } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { MarkPaidData, MarkPaidDialogComponent } from '../payments/mark-paid.dialog';
import { formatMoney } from '../payments/payments.helpers';
import { ExpenseDialogComponent, ExpenseDialogData } from './expense.dialog';
import { CERTAINTY_LABEL, ExpenseFilter, ExpenseLine, ExpensesData, STATUS_LABEL, commitmentCuts, expenseSections, periodOf, summaryNote } from './expenses.helpers';

const DATE = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const FILTERS: readonly { value: ExpenseFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'once', label: 'Una sola vez' },
  { value: 'repeat', label: 'Se repite' },
];

/** Primer día del mes, a N años de hoy: un año atrás y uno adelante caben en la consulta. */
function yearsFrom(today: string, years: number): string {
  return `${Number(today.slice(0, 4)) + years}${today.slice(4, 7)}-01`;
}

/** Gastos y compromisos del establecimiento (F16 en Stitch). Solo registra. */
@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <header class="head">
      <div>
        <h1>Gastos @if (context.current(); as e) { <span class="place">· {{ e.name }}</span> }</h1>
        <p class="sub">Registra tus gastos y compromisos y consulta lo que vence. Registro interno; no es contabilidad ni comprobante fiscal.</p>
      </div>
      @if (permissions.can('manage') && data()) {
        <button mat-flat-button color="primary" (click)="add()"><mat-icon>add</mat-icon> Agregar gasto</button>
      }
    </header>

    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

    @if (data(); as d) {
      @if (isEmpty()) {
        <section class="empty">
          <h2>Agrega tu primer gasto</h2>
          <p>Captura lo que pagas una sola vez y lo que se repite. Con eso verás cuánto necesitas en los próximos 30 días.</p>
          @if (permissions.can('manage')) {
            <button mat-flat-button color="primary" (click)="add()">Agregar gasto</button>
          } @else {
            <p class="muted">Pide a quien administra el gabinete que capture los gastos.</p>
          }
        </section>
      } @else {
        @if (d.plan.items.length > 0) {
          <section class="summary" aria-labelledby="need">
            <h2 id="need">Cuánto necesitas en los próximos 30 días</h2>
            <p class="reading">La cifra grande es lo acumulado hasta ese corte, sin contar lo ya pagado.</p>
            <div class="cuts">
              @for (cut of cuts(); track cut.label) {
                <div class="cut" [class.late]="cut.overdue">
                  <span class="cut-label">{{ cut.label }}</span>
                  <strong class="cumulative">{{ money(cut.cumulativeCents) }}</strong>
                  @if (cut.cutCents > 0) {
                    <span class="cut-detail">En este corte {{ money(cut.cutCents) }}</span>
                  } @else if (cut.unknownCount === 0) {
                    <span class="cut-detail">Nada en este corte</span>
                  }
                  @if (cut.estimatedCents > 0) { <span class="cut-detail">{{ money(cut.estimatedCents) }} estimado</span> }
                  @if (cut.unknownCount > 0) { <span class="cut-detail gap">{{ cut.unknownCount }} sin dato</span> }
                </div>
              }
            </div>
            @if (note()) { <p class="note">{{ note() }}</p> }
          </section>
        }

        <div class="filters" role="group" aria-label="Filtrar gastos">
          @for (f of filterOptions; track f.value) {
            <button type="button" class="filter" [class.on]="filter() === f.value" [attr.aria-pressed]="filter() === f.value" (click)="filter.set(f.value)">{{ f.label }}</button>
          }
        </div>

        @for (section of sections(); track section.key) {
          <section class="section">
            <h2>{{ section.title }} <span class="count">{{ section.lines.length }}</span></h2>
            <ul class="list">
              @for (line of section.lines; track line.key) {
                <li class="line">
                  <div class="name"><span class="title">{{ line.name }}</span><span class="meta">{{ line.detail }}</span></div>
                  <div class="due">{{ date(line.dueOn) }}</div>
                  <div class="amount">
                    @if (line.amountCents !== null) { <span>{{ money(line.amountCents) }}</span> }
                    <span class="meta">{{ certainty[line.certainty] }}</span>
                  </div>
                  <span class="chip {{ line.status }}">{{ status[line.status] }}</span>
                  <div class="act">
                    @if (line.status === 'overdue' || line.status === 'pending') {
                      <button mat-stroked-button class="pay" [disabled]="busy()" (click)="markPaid(line)">Marcar como pagado</button>
                    } @else {
                      <button mat-button class="undo" [disabled]="busy()" (click)="undo(line)">Deshacer</button>
                    }
                  </div>
                  <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'Más acciones de ' + line.name"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #menu="matMenu">
                    @if (line.source === 'recurring' && (line.status === 'overdue' || line.status === 'pending')) {
                      <button mat-menu-item (click)="skip(line)">Omitir este periodo</button>
                    }
                    @if (permissions.can('manage')) {
                      <button mat-menu-item (click)="edit(line)">Editar</button>
                      <button mat-menu-item (click)="remove(line)">{{ line.source === 'expense' ? 'Anular gasto' : 'Dejar de seguir' }}</button>
                    }
                  </mat-menu>
                </li>
              }
            </ul>
          </section>
        } @empty {
          <p class="muted">No hay gastos con este filtro.</p>
        }
      }
    }
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 16px; }
    .head button { flex: none; }
    h1 { margin: 0; } .place { color: #475569; font-weight: 500; }
    .sub { margin: 4px 0 0; color: #475569; font-size: 14px; max-width: 70ch; }
    h2 { font-size: 16px; color: #1e3a8a; margin: 0 0 12px; }
    .summary { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; }
    .reading { margin: -8px 0 12px; font-size: 13px; color: #475569; }
    .cuts { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .cut { display: flex; flex-direction: column; gap: 2px; padding: 0 16px; border-left: 1px solid #e2e8f0; min-width: 0; }
    .cut:first-child { border-left: 0; padding-left: 0; }
    .cut-label { font-size: 13px; font-weight: 600; color: #475569; }
    .late .cut-label { color: #991b1b; }
    .cumulative { font-size: 20px; line-height: 28px; color: #0f172a; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .cut-detail { font-size: 13px; color: #475569; font-variant-numeric: tabular-nums; }
    .gap { color: #92400e; font-weight: 600; }
    .note { margin: 12px 0 0; font-size: 13px; color: #475569; }
    .filters { display: flex; gap: 4px; margin-top: 24px; }
    .filter { min-height: 40px; padding: 0 14px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 14px; color: #475569; cursor: pointer; }
    .filter:hover { background: #f1f5f9; }
    .filter.on { background: #dbeafe; color: #1e3a8a; font-weight: 600; }
    .filter:focus-visible { outline: 2px solid #2563c9; outline-offset: 2px; }
    .section { margin-top: 20px; }
    .section h2 { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .count { font-size: 12px; font-weight: 600; color: #475569; background: #e2e8f0; border-radius: 10px; padding: 0 8px; }
    .list { list-style: none; margin: 0; padding: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .line { display: grid; grid-template-columns: minmax(180px, 1fr) 104px 112px 84px 188px 40px; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid #e2e8f0; }
    .line:first-child { border-top: 0; }
    .name, .amount { display: flex; flex-direction: column; min-width: 0; }
    .amount { font-variant-numeric: tabular-nums; font-size: 14px; color: #0f172a; }
    .title { font-weight: 700; font-size: 14px; color: #0f172a; }
    .meta { font-size: 13px; color: #475569; }
    .due { font-size: 14px; color: #0f172a; font-variant-numeric: tabular-nums; }
    .chip { justify-self: start; font-size: 12px; font-weight: 600; border-radius: 12px; padding: 2px 10px; white-space: nowrap; background: #fef3c7; color: #92400e; }
    .chip.overdue { background: #fee2e2; color: #991b1b; }
    .chip.paid { background: #dcfce7; color: #166534; }
    .chip.skipped { background: #e2e8f0; color: #334155; }
    .act { justify-self: end; }
    .pay { white-space: nowrap; }
    .empty { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-top: 16px; }
    .empty p { max-width: 65ch; color: #475569; font-size: 14px; }
    .muted { color: #475569; font-size: 14px; }
    .error { color: #b91c1c; font-size: 14px; }
    @media (max-width: 1100px) {
      .cuts { grid-template-columns: 1fr; gap: 12px; }
      .cut { border-left: 0; padding: 0 0 12px; border-bottom: 1px solid #e2e8f0; }
      .cut:last-child { border-bottom: 0; padding-bottom: 0; }
      .line { grid-template-columns: 1fr auto 40px; }
      .name { grid-column: 1; }
      .amount { grid-column: 2; grid-row: 1; text-align: right; }
      .line > button[mat-icon-button] { grid-column: 3; grid-row: 1; }
      .due { grid-column: 1; }
      .chip { grid-column: 2; justify-self: end; }
      .act { grid-column: 1 / -1; justify-self: start; }
    }
    @media (max-width: 640px) { .head { flex-direction: column; gap: 8px; } }
  `],
})
export class ExpensesComponent {
  readonly context = inject(EstablishmentContextService);
  readonly permissions = inject(PermissionsService);
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);

  readonly data = signal<ExpensesData | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly filter = signal<ExpenseFilter>('all');
  /** Cambiar de establecimiento cancela la carga anterior. */
  private loading?: Subscription;

  readonly filterOptions = FILTERS;
  readonly certainty = CERTAINTY_LABEL;
  readonly status = STATUS_LABEL;
  readonly money = formatMoney;

  readonly cuts = computed(() => {
    const d = this.data();
    return d ? commitmentCuts(d.plan) : [];
  });
  readonly note = computed(() => {
    const d = this.data();
    return d ? summaryNote(d.plan.totals) : '';
  });
  readonly sections = computed(() => {
    const d = this.data();
    return d ? expenseSections(d, this.filter()) : [];
  });
  readonly isEmpty = computed(() => {
    const d = this.data();
    return !!d && expenseSections(d, 'all').length === 0;
  });

  constructor() {
    effect(() => {
      const e = this.context.current();
      if (e) this.load(e.id);
    });
  }

  private load(id: string): void {
    this.loading?.unsubscribe();
    this.loading = this.api
      .commitments(id)
      .pipe(
        switchMap((plan) =>
          forkJoin({
            overview: this.api.recurringPayments(id),
            list: this.api.expenses(id, yearsFrom(plan.today, -1), yearsFrom(plan.today, 1)),
          }).pipe(map(({ overview, list }): ExpensesData => ({ plan, overview, expenses: list.expenses }))),
        ),
      )
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.error.set(null);
        },
        error: (err: HttpErrorResponse) => this.error.set(`No pudimos cargar tus gastos. ${apiMessage(err)}`),
      });
  }

  private reload(): void {
    const id = this.context.current()?.id;
    if (id) this.load(id);
  }

  date(value: string): string {
    return DATE.format(new Date(`${value}T00:00:00Z`)).replaceAll('.', '');
  }

  add(): void {
    this.openDialog({});
  }

  edit(line: ExpenseLine): void {
    const d = this.data();
    if (!d) return;
    const expense = d.expenses.find((e) => e.id === line.sourceId);
    const payment = d.overview.payments.find((p) => p.id === line.sourceId);
    if (expense || payment) this.openDialog({ expense, payment });
  }

  private openDialog(editing: Pick<ExpenseDialogData, 'expense' | 'payment'>): void {
    const establishment = this.context.current();
    const today = this.data()?.plan.today;
    if (!establishment || !today) return;
    const data: ExpenseDialogData = { establishmentId: establishment.id, today, ...editing };
    this.dialog
      .open(ExpenseDialogComponent, { width: '560px', data })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  /** Un monto conocido se marca con un clic; uno variable pregunta cuánto fue. */
  markPaid(line: ExpenseLine): void {
    if (line.source === 'expense') {
      this.run(this.api.markExpensePaid(line.sourceId, {}));
      return;
    }
    const payment = this.data()?.overview.payments.find((p) => p.id === line.sourceId);
    if (payment?.amountMode === 'fixed' && payment.amountCents !== null) {
      this.run(this.api.markPaymentPaid(payment.id, { dueOn: line.dueOn, paidCents: payment.amountCents }));
      return;
    }
    const data: MarkPaidData = { paymentId: line.sourceId, name: line.name, dueOn: line.dueOn, today: this.data()?.plan.today ?? line.dueOn };
    this.dialog
      .open(MarkPaidDialogComponent, { width: '420px', data })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  undo(line: ExpenseLine): void {
    this.run(line.source === 'expense' ? this.api.unmarkExpensePaid(line.sourceId) : this.api.unmarkPaymentPaid(line.sourceId, periodOf(line)));
  }

  skip(line: ExpenseLine): void {
    this.run(this.api.skipPaymentPeriod(line.sourceId, line.dueOn));
  }

  remove(line: ExpenseLine): void {
    const question = line.source === 'expense' ? `¿Anular ${line.name}? Dejará de contar en tus gastos.` : `¿Dejar de seguir ${line.name}? Ya no aparecerá en esta lista.`;
    if (!confirm(question)) return;
    this.run(line.source === 'expense' ? this.api.voidExpense(line.sourceId) : this.api.deleteRecurringPayment(line.sourceId));
  }

  private run(request: Observable<void>): void {
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
