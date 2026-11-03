import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Appointment, AppointmentKind, EstablishmentStatus, EvaluatedObligation } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { RecordEvidenceDialogComponent } from '../evidence/record-evidence.dialog';
import { CalendarEntry, UPCOMING_DAYS, addDays, calendarEntriesByDay, monthGrid, monthRange, upcomingEntries } from './calendar.helpers';
import { ScheduleAppointmentDialogComponent, ScheduleAppointmentData } from './schedule-appointment.dialog';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTH_FORMAT = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FORMAT = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

const KIND_ICONS: Record<AppointmentKind, string> = {
  service: 'pest_control',
  filing: 'account_balance',
  inspection: 'policy',
  other: 'event',
};

/** Calendario del establecimiento: vencimientos que piden atención y citas (F11 en Stitch). */
@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="head">
      <div>
        <h1>Calendario @if (context.current(); as e) { <span class="place">· {{ e.name }}</span> }</h1>
        <p class="sub">Vencimientos que piden atención y citas programadas: fumigación, trámites, visitas.</p>
      </div>
      <div class="stats" aria-label="Resumen">
        <div class="stat"><mat-icon class="red">error_outline</mat-icon><span>Vencidos<strong>{{ status()?.score?.overdue ?? 0 }}</strong></span></div>
        <div class="stat"><mat-icon class="amber">schedule</mat-icon><span>Por vencer<strong>{{ status()?.score?.dueSoon ?? 0 }}</strong></span></div>
        <div class="stat"><mat-icon class="blue">event</mat-icon><span>Programadas<strong>{{ scheduledCount() }}</strong></span></div>
      </div>
    </div>

    <div class="toolbar">
      <div class="month-nav">
        <button mat-icon-button (click)="shift(-1)" aria-label="Mes anterior"><mat-icon>chevron_left</mat-icon></button>
        <span class="month" aria-live="polite">{{ monthLabel() }}</span>
        <button mat-icon-button (click)="shift(1)" aria-label="Mes siguiente"><mat-icon>chevron_right</mat-icon></button>
      </div>
      <button mat-stroked-button (click)="goToday()">Hoy</button>
      <span class="spacer"></span>
      <button mat-flat-button color="primary" (click)="schedule()" [disabled]="!context.current()"><mat-icon>add</mat-icon> Programar cita</button>
    </div>

    <div class="layout">
      <section class="grid-wrap" aria-label="Mes">
        <div class="grid">
          @for (w of weekdays; track w) { <div class="weekday">{{ w }}</div> }
          @for (day of days(); track day.date) {
            <div class="cell" [class.out]="!day.inMonth" [class.today]="day.date === today()">
              <button class="day-number" (click)="schedule(day.date)" [attr.aria-label]="'Programar cita el ' + day.date" matTooltip="Programar cita este día">
                {{ dayOfMonth(day.date) }}
              </button>
              @for (entry of byDay().get(day.date) ?? []; track entry.type + entry.id) {
                <button class="pill" [class]="'pill ' + pillClass(entry)" (click)="open(entry)" [matTooltip]="pillText(entry)" [attr.aria-label]="pillText(entry)">
                  <mat-icon>{{ pillIcon(entry) }}</mat-icon><span>{{ pillText(entry) }}</span>
                </button>
              }
            </div>
          }
        </div>
        <div class="legend" aria-hidden="true">
          <span><i class="dot overdue"></i>Vencido</span>
          <span><i class="dot due-soon"></i>Por vencer</span>
          <span><i class="dot appointment"></i>Cita programada</span>
          <span><i class="dot done"></i>Cita hecha</span>
        </div>
      </section>

      <aside class="upcoming" aria-label="Próximos 30 días">
        <h2>Próximos {{ upcomingDays }} días <span class="count">{{ upcoming().length }}</span></h2>
        @for (entry of upcoming(); track entry.type + entry.id) {
          <article class="card" [class]="'card c-' + pillClass(entry)">
            <div class="card-top">
              <span class="when"><mat-icon>{{ pillIcon(entry) }}</mat-icon>{{ whenLabel(entry) }}</span>
              <span class="badge" [class]="'badge ' + pillClass(entry)">{{ badge(entry) }}</span>
            </div>
            <div class="card-title">{{ entry.title }}</div>
            @if (entry.type === 'appointment') {
              @if (entry.appointment.location) { <div class="card-meta">{{ entry.appointment.location }}</div> }
              <div class="card-actions">
                @if (entry.appointment.state === 'scheduled') {
                  <button mat-stroked-button (click)="markDone(entry.appointment)"><mat-icon>check</mat-icon> Marcar como hecha</button>
                } @else {
                  @if (obligationOf(entry.appointment); as o) {
                    <button mat-flat-button color="primary" (click)="record(o)"><mat-icon>upload_file</mat-icon> Registrar evidencia</button>
                  }
                }
                <button mat-icon-button (click)="edit(entry.appointment)" aria-label="Editar cita"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button class="danger" (click)="cancel(entry.appointment)" aria-label="Cancelar cita"><mat-icon>close</mat-icon></button>
              </div>
            } @else {
              <div class="card-actions">
                <button mat-stroked-button (click)="record(entry.obligation)">Registrar</button>
                <button mat-button (click)="schedule(today(), entry.obligation)"><mat-icon>event</mat-icon> Agendar</button>
              </div>
            }
          </article>
        } @empty {
          <p class="empty">Nada pendiente en los próximos {{ upcomingDays }} días.</p>
        }
      </aside>
    </div>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    h1 { margin: 0; } .place { color: #475569; font-weight: 500; }
    .sub { margin: 4px 0 16px; color: #64748b; font-size: 13px; }
    .stats { display: flex; gap: 8px; }
    .stat { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 12px; font-size: 12px; color: #475569; }
    .stat span { display: flex; flex-direction: column; } .stat strong { font-size: 18px; color: #0f172a; }
    .red { color: #991b1b; } .amber { color: #92400e; } .blue { color: #2563c9; }
    .toolbar { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 8px 12px; margin-bottom: 16px; }
    .month-nav { display: flex; align-items: center; background: #f1f5f9; border-radius: 12px; }
    .month { min-width: 170px; text-align: center; font-weight: 700; color: #1e3a8a; text-transform: capitalize; }
    .spacer { flex: 1; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
    .weekday { padding: 10px 6px; text-align: center; font-size: 12px; font-weight: 600; color: #334155; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .cell { min-height: 104px; padding: 6px; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .cell:nth-child(7n + 7) { border-right: 0; }
    .cell.out { background: #f8fafc; } .cell.out .day-number { color: #94a3b8; }
    .cell.today { box-shadow: inset 0 0 0 2px #2563c9; }
    .day-number { align-self: flex-start; border: 0; background: none; font: inherit; font-weight: 600; font-size: 13px; color: #0f172a; cursor: pointer; border-radius: 8px; padding: 2px 6px; min-width: 28px; min-height: 28px; }
    .day-number:hover, .day-number:focus-visible { background: #eef2fb; }
    .pill { display: flex; align-items: flex-start; gap: 4px; width: 100%; border: 0; border-radius: 8px; padding: 3px 6px; font: inherit; font-size: 11px; font-weight: 600; text-align: left; cursor: pointer; min-width: 0; }
    .pill span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.3; }
    .pill mat-icon, .when mat-icon { font-size: 14px; width: 14px; height: 14px; flex: none; }
    .overdue { background: #fee2e2; color: #991b1b; } .due-soon { background: #fef3c7; color: #92400e; }
    .appointment { background: #dbeafe; color: #1e3a8a; } .done { background: #dcfce7; color: #166534; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; font-size: 12px; color: #475569; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    .upcoming h2 { font-size: 16px; margin: 0 0 10px; color: #1e3a8a; display: flex; align-items: center; gap: 8px; }
    .count { font-size: 12px; background: #eef2fb; color: #1e3a8a; border-radius: 10px; padding: 1px 8px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-left-width: 4px; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; }
    .c-overdue { border-left-color: #991b1b; } .c-due-soon { border-left-color: #92400e; }
    .c-appointment { border-left-color: #2563c9; } .c-done { border-left-color: #166534; }
    .card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; }
    .when { display: flex; align-items: center; gap: 4px; color: #475569; }
    .badge { font-weight: 600; border-radius: 10px; padding: 1px 8px; }
    .card-title { font-weight: 700; font-size: 14px; color: #0f172a; margin-top: 6px; }
    .card-meta { font-size: 12px; color: #475569; margin-top: 2px; }
    .card-actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
    .danger { color: #b91c1c; }
    .empty { color: #64748b; font-size: 13px; }
    @media (max-width: 1024px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 640px) {
      .grid-wrap { display: none; }
      .stats { width: 100%; } .stat { flex: 1; }
      .toolbar { flex-wrap: wrap; }
    }
  `],
})
export class CalendarComponent {
  readonly context = inject(EstablishmentContextService);
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);
  readonly weekdays = WEEKDAYS;
  readonly upcomingDays = UPCOMING_DAYS;

  readonly status = signal<EstablishmentStatus | null>(null);
  readonly monthAppointments = signal<Appointment[]>([]);
  readonly nextAppointments = signal<Appointment[]>([]);
  /** Mes visible: año y mes de 0 a 11. */
  readonly visible = signal<{ year: number; month: number } | null>(null);

  readonly today = computed(() => this.status()?.today ?? '');
  readonly days = computed(() => {
    const v = this.visible();
    return v ? monthGrid(v.year, v.month) : [];
  });
  readonly monthLabel = computed(() => {
    const v = this.visible();
    return v ? MONTH_FORMAT.format(Date.UTC(v.year, v.month, 1)) : '';
  });
  readonly byDay = computed(() => calendarEntriesByDay(this.status()?.obligations ?? [], this.monthAppointments()));
  readonly upcoming = computed(() => upcomingEntries(this.today(), this.status()?.obligations ?? [], this.nextAppointments()));
  readonly scheduledCount = computed(() => this.nextAppointments().filter((a) => a.state === 'scheduled').length);

  constructor() {
    effect(() => {
      const e = this.context.current();
      if (e) this.loadStatus(e.id);
    });
    effect(() => {
      const e = this.context.current();
      const v = this.visible();
      if (e && v) this.api.appointments(e.id, monthRange(v.year, v.month)).subscribe((list) => this.monthAppointments.set(list));
    });
  }

  private loadStatus(id: string): void {
    this.api.status(id).subscribe((s) => {
      this.status.set(s);
      if (!this.visible()) this.goToday();
      this.api.appointments(id, { from: s.today, to: addDays(s.today, UPCOMING_DAYS) }).subscribe((list) => this.nextAppointments.set(list));
    });
  }

  private reload(): void {
    const id = this.context.current()?.id;
    if (!id) return;
    this.loadStatus(id);
    this.visible.set({ ...(this.visible() as { year: number; month: number }) });
  }

  goToday(): void {
    const [year, month] = (this.today() || new Date().toISOString().slice(0, 10)).split('-').map(Number);
    this.visible.set({ year, month: month - 1 });
  }

  shift(months: number): void {
    const v = this.visible();
    if (!v) return;
    const index = v.year * 12 + v.month + months;
    this.visible.set({ year: Math.floor(index / 12), month: index % 12 });
  }

  dayOfMonth(date: string): number {
    return Number(date.slice(8));
  }

  pillClass(entry: CalendarEntry): string {
    if (entry.type === 'due') return entry.obligation.status;
    return entry.appointment.state === 'done' ? 'done' : 'appointment';
  }

  pillIcon(entry: CalendarEntry): string {
    if (entry.type === 'due') return entry.obligation.status === 'overdue' ? 'error_outline' : 'schedule';
    return entry.appointment.state === 'done' ? 'check_circle' : KIND_ICONS[entry.appointment.kind];
  }

  pillText(entry: CalendarEntry): string {
    if (entry.type === 'due') return `${entry.obligation.status === 'overdue' ? 'Vencido' : 'Vence'} · ${entry.title}`;
    const time = entry.appointment.startTime ? `${entry.appointment.startTime} · ` : '';
    return `${time}${entry.title}`;
  }

  whenLabel(entry: CalendarEntry & { date: string }): string {
    const day = DAY_FORMAT.format(new Date(`${entry.date}T00:00:00Z`));
    return entry.type === 'appointment' && entry.appointment.startTime ? `${day} · ${entry.appointment.startTime}` : day;
  }

  badge(entry: CalendarEntry): string {
    if (entry.type === 'due') return entry.obligation.status === 'overdue' ? 'Vencido' : 'Por vencer';
    return entry.appointment.state === 'done' ? 'Hecha' : 'Programada';
  }

  obligationOf(appointment: Appointment): EvaluatedObligation | undefined {
    return this.status()?.obligations.find((o) => o.id === appointment.obligationId);
  }

  open(entry: CalendarEntry): void {
    if (entry.type === 'due') this.record(entry.obligation);
    else this.edit(entry.appointment);
  }

  schedule(date = this.today(), obligation?: EvaluatedObligation): void {
    const establishment = this.context.current();
    if (!establishment) return;
    this.openDialog({
      establishmentId: establishment.id,
      obligations: this.status()?.obligations ?? [],
      date,
      obligationId: obligation?.id,
    });
  }

  edit(appointment: Appointment): void {
    this.openDialog({
      establishmentId: appointment.establishmentId,
      obligations: this.status()?.obligations ?? [],
      date: appointment.scheduledOn,
      editing: appointment,
    });
  }

  markDone(appointment: Appointment): void {
    this.api.updateAppointment(appointment.id, { state: 'done' }).subscribe(() => this.reload());
  }

  cancel(appointment: Appointment): void {
    if (!confirm(`¿Cancelar «${appointment.title}» del ${appointment.scheduledOn}?`)) return;
    this.api.cancelAppointment(appointment.id).subscribe(() => this.reload());
  }

  record(obligation: EvaluatedObligation): void {
    this.dialog
      .open(RecordEvidenceDialogComponent, { width: '560px', data: { obligation, today: this.today() } })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  private openDialog(data: ScheduleAppointmentData): void {
    this.dialog
      .open(ScheduleAppointmentDialogComponent, { width: '560px', data })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }
}
