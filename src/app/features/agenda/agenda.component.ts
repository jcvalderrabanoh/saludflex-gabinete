import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, filter, of, switchMap, tap } from 'rxjs';
import { AgendaAppointment, AgendaAppointmentState, AgendaBooked, AgendaContact, AgendaDay, AgendaLane, AgendaServiceType } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { AppointmentDetailData, AppointmentDetailDialogComponent, AppointmentDetailResult } from './appointment-detail.dialog';
import { BookAppointmentData, BookAppointmentDialogComponent } from './book-appointment.dialog';
import { overlapWarning, snapMinutes } from './booking.helpers';
import { AgendaLaneComponent, LaneView, PlacedAppointment } from './agenda-lane.component';
import {
  DEFAULT_TIME_ZONE,
  DayAxis,
  Place,
  STATE_VIEWS,
  appointmentPlace,
  bandPlace,
  blockPlace,
  clockOf,
  clockOfMinutes,
  closedBands,
  dayAxis,
  daySummary,
  gridAppointments,
  laneRange,
  longDate,
  nowMinutes,
  pixelsPerMinute,
  shiftDate,
  todayIn,
} from './agenda.helpers';

/** Alto a partir del cual una cita muestra una segunda línea. */
const TWO_LINES_HEIGHT = 44;
const REFRESH_NOW_EVERY_MS = 60_000;
/** Al abrir un día, la parrilla se desplaza hasta un poco antes de lo que importa. */
const SCROLL_LEAD_MINUTES = 45;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const LEGEND: readonly AgendaAppointmentState[] = ['scheduled', 'arrived', 'attended', 'no_show'];

/** Agenda del día: un carril por equipo del establecimiento, con su horario, bloqueos y citas. */
@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, AgendaLaneComponent],
  template: `
    <header class="head">
      <h1>Agenda</h1>
      <div class="days" role="group" aria-label="Cambiar de día">
        <button mat-stroked-button (click)="move(-1)"><mat-icon>chevron_left</mat-icon> Anterior</button>
        <button mat-stroked-button (click)="goToday()" [disabled]="isToday()">Hoy</button>
        <button mat-stroked-button (click)="move(1)">Siguiente <mat-icon iconPositionEnd>chevron_right</mat-icon></button>
      </div>
      <label class="pick">
        <span class="date" aria-live="polite">{{ dateLabel() }}</span>
        <input type="date" [value]="date()" (change)="pick($any($event.target).value)" aria-label="Ir a una fecha" />
      </label>
      @if (canManage()) {
        <button mat-flat-button color="primary" class="new" (click)="book()" [disabled]="lanes().length === 0"><mat-icon>add</mat-icon> Agendar cita</button>
      }
    </header>

    @if (error()) {
      <div class="notice" role="alert">
        <p>No pudimos cargar la agenda de este día.</p>
        <button mat-stroked-button (click)="reload()"><mat-icon>refresh</mat-icon> Volver a intentar</button>
      </div>
    } @else if (!day()) {
      <p class="muted" role="status">Cargando la agenda…</p>
    } @else if (lanes().length === 0) {
      <div class="notice">
        <p>Este establecimiento aún no tiene equipos. La agenda muestra un carril por cada equipo.</p>
        <a mat-stroked-button routerLink="/operacion/equipos-y-personal">Ir a Equipos y personal</a>
      </div>
    } @else {
      <p class="summary">{{ summaryText() }}</p>

      <div #board class="board" [class.stale]="loading()" [style.--lanes]="lanes().length" tabindex="0" role="region" aria-label="Citas del día por equipo">
        <div class="row names">
          <div class="corner">Hora</div>
          @for (view of lanes(); track view.lane.id) {
            <div class="name">
              <strong>{{ view.lane.name }}</strong>
              <span>{{ view.lane.room ? view.lane.room + ' · ' : '' }}{{ plural(view.count, 'cita', 'citas') }}{{ view.range ? ' · ' + view.range : '' }}</span>
            </div>
          }
        </div>

        <div class="row" [style.height.px]="axis().height">
          <div class="axis" aria-hidden="true">
            @for (mark of axis().marks; track mark.minutes) {
              <span class="mark" [class.half]="!mark.onTheHour" [style.top.px]="mark.top">{{ mark.label }}</span>
            }
            @if (nowTop() !== null) {
              <span class="now-label" [style.top.px]="nowTop()">{{ nowClock() }}</span>
            }
          </div>
          @for (view of lanes(); track view.lane.id) {
            <app-agenda-lane [view]="view" [marks]="axis().marks" [nowTop]="nowTop()" [bookable]="canManage()" (open)="open($event, view.lane)" (book)="bookAt(view.lane, $event)" />
          }
        </div>
      </div>

      <ul class="legend" aria-label="Estados de las citas">
        @for (state of legend; track state) {
          <li [class]="state"><mat-icon aria-hidden="true">{{ views[state].icon }}</mat-icon> {{ views[state].label }}</li>
        }
        <li class="urgent"><mat-icon aria-hidden="true">priority_high</mat-icon> Urgente</li>
        <li><span class="swatch closed" aria-hidden="true"></span> Fuera de horario</li>
        <li><span class="swatch blocked" aria-hidden="true"></span> Bloqueado</li>
      </ul>
    }
  `,
  styles: [`
    .head { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; }
    h1 { margin: 0; }
    .days { display: flex; gap: 8px; }
    .pick { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
    .date { font-size: 18px; font-weight: 600; }
    .pick input { height: 40px; padding: 0 8px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font: inherit; font-size: 14px; color: #0f172a; }
    .new { margin-left: auto; }
    .summary, .muted { margin: 8px 0 16px; font-size: 14px; color: #475569; }
    .notice { margin-top: 16px; padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .notice p { margin: 0 0 12px; }

    .board { --axis: 64px; --head: 58px; overflow: auto; max-height: calc(100vh - 250px); background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .board.stale { opacity: 0.55; }
    .row { display: grid; grid-template-columns: var(--axis) repeat(var(--lanes), minmax(220px, 1fr)); min-width: min-content; }
    .names { position: sticky; top: 0; z-index: 4; box-sizing: border-box; height: var(--head); background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .corner { position: sticky; left: 0; z-index: 1; background: #f8fafc; padding: 12px 8px; font-size: 12px; font-weight: 600; color: #526077; text-align: right; }
    .name { padding: 10px 12px; border-left: 1px solid #e2e8f0; min-width: 0; scroll-snap-align: start; }
    .name strong, .name span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name strong { font-size: 15px; }
    .name span { font-size: 12px; color: #526077; }

    .axis { position: sticky; left: 0; z-index: 3; background: #fff; }
    .mark { position: absolute; right: 8px; transform: translateY(2px); font-size: 12px; font-weight: 600; color: #334155; font-variant-numeric: tabular-nums; }
    .mark.half { font-weight: 400; color: #64748b; }
    .now-label { position: absolute; right: 4px; transform: translateY(-50%); padding: 1px 6px; border-radius: 6px; background: #2563c9; color: #fff; font-size: 12px; font-weight: 700; }

    .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 12px 0 0; padding: 0; font-size: 13px; color: #334155; }
    .legend li { display: inline-flex; align-items: center; gap: 4px; }
    .legend mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .legend .arrived { color: #166534; font-weight: 700; }
    .legend .attended { color: #5b6b80; }
    .legend .no_show, .legend .urgent { color: #b91c1c; }
    .swatch { width: 16px; height: 12px; border-radius: 3px; border: 1px solid #cbd5e1; }
    .swatch.closed { background: #f1f5f9; }
    .swatch.blocked { background: #fde9a8; }

    @media (max-width: 767.98px) {
      .board { --axis: 52px; max-height: calc(100vh - 300px); scroll-snap-type: x proximity; scroll-padding-left: var(--axis); }
      .days { width: 100%; }
      .days button { flex: 1; min-width: 0; min-height: 44px; }
      .pick input { height: 44px; }
      .new { width: 100%; min-height: 44px; }
    }
  `],
})
export class AgendaComponent {
  private readonly api = inject(AgendaApiService);
  private readonly context = inject(EstablishmentContextService);
  private readonly injector = inject(Injector);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly permissions = inject(PermissionsService);
  private readonly board = viewChild<ElementRef<HTMLElement>>('board');

  readonly views = STATE_VIEWS;
  readonly legend = LEGEND;

  readonly canManage = computed(() => this.permissions.can('agendaManage'));
  private readonly services = signal<AgendaServiceType[]>([]);
  readonly day = signal<AgendaDay | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  /** Avanza cada minuto para mover la línea de «ahora». */
  private readonly now = signal(new Date());
  private readonly reloads = signal(0);
  /** El día que la persona eligió; `null` es «hoy», que avanza solo a medianoche. */
  private readonly chosen = signal<string | null>(null);

  /** Las fechas se leen en la zona del establecimiento, no en la del navegador. */
  private readonly timeZone = computed(() => this.context.current()?.timeZone || DEFAULT_TIME_ZONE);
  private readonly today = computed(() => todayIn(this.timeZone(), this.now()));
  readonly date = computed(() => this.chosen() ?? this.today());
  readonly isToday = computed(() => this.date() === this.today());
  readonly dateLabel = computed(() => longDate(this.date()));

  /** Los equipos del establecimiento elegido en la barra superior; ninguno mientras no se conoce. */
  private readonly ownLanes = computed(() => {
    const establishmentId = this.context.current()?.id;
    return establishmentId ? (this.day()?.resources ?? []).filter((lane) => lane.establishmentId === establishmentId) : [];
  });

  private readonly scale = computed(() => pixelsPerMinute(this.ownLanes()));
  readonly axis = computed(() => dayAxis(this.ownLanes(), this.scale()));
  readonly lanes = computed(() => this.ownLanes().map((lane) => this.viewOf(lane, this.axis())));

  /** «12 citas · 3 llegaron · 1 urgente»; solo lo que hay. */
  readonly summaryText = computed(() => {
    const summary = daySummary(this.ownLanes());
    if (summary.total === 0) return 'No hay citas para este día.';
    const parts: [number, string, string][] = [
      [summary.total, 'cita', 'citas'],
      [summary.arrived, 'llegó', 'llegaron'],
      [summary.attended, 'atendida', 'atendidas'],
      [summary.urgent, 'urgente', 'urgentes'],
      [summary.noShow, 'no se presentó', 'no se presentaron'],
    ];
    return parts.filter(([count]) => count > 0).map(([count, one, many]) => this.plural(count, one, many)).join(' · ');
  });

  private readonly nowMinute = computed(() => {
    const [lane] = this.ownLanes();
    const minutes = lane ? nowMinutes(lane, this.date(), this.now()) : null;
    const { from, to } = this.axis().window;
    return minutes !== null && minutes >= from && minutes <= to ? minutes : null;
  });
  readonly nowTop = computed(() => {
    const minutes = this.nowMinute();
    return minutes === null ? null : this.axis().top(minutes);
  });
  readonly nowClock = computed(() => clockOfMinutes(this.nowMinute() ?? 0));

  constructor() {
    // Sin establecimiento aún no se sabe qué día es «hoy» ni qué carriles tocan.
    const request = computed(() => (this.context.current() ? { date: this.date(), attempt: this.reloads() } : null));
    toObservable(request)
      .pipe(
        filter((value) => value !== null),
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        switchMap(({ date }) => this.api.day(date).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(),
      )
      .subscribe((day) => {
        this.loading.set(false);
        this.error.set(day === null);
        this.day.set(day);
      });

    // Al llegar un día, o al cambiar de establecimiento, la parrilla va a lo que importa.
    effect(() => {
      this.ownLanes();
      untracked(() => afterNextRender(() => this.scrollToFocus(), { injector: this.injector }));
    });

    // Sin catálogo se puede ver la agenda; agendar pedirá elegir servicio y no habrá ninguno.
    this.api.serviceTypes().pipe(catchError(() => of<AgendaServiceType[]>([]))).subscribe((services) => this.services.set(services));

    const timer = setInterval(() => this.now.set(new Date()), REFRESH_NOW_EVERY_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  move(days: number): void {
    this.chosen.set(shiftDate(this.date(), days));
  }

  goToday(): void {
    this.chosen.set(null);
  }

  /** El selector de fecha puede vaciarse: entonces no se cambia de día. */
  pick(value: string): void {
    if (LOCAL_DATE.test(value)) this.chosen.set(value === this.today() ? null : value);
  }

  reload(): void {
    this.reloads.update((n) => n + 1);
  }

  /** Abre el diálogo de agendar, vacío o con lo que ya se sabe (hueco, paciente o cita a mover). */
  book(prefill: Partial<BookAppointmentData> = {}): void {
    const data: BookAppointmentData = { date: this.date(), timeZone: this.timeZone(), lanes: this.ownLanes(), services: this.services(), ...prefill };
    this.dialog
      .open<BookAppointmentDialogComponent, BookAppointmentData, AgendaBooked>(BookAppointmentDialogComponent, { data, width: '640px', maxWidth: '100vw' })
      .afterClosed()
      .subscribe((booked) => booked && this.afterBooking(booked, !!prefill.rescheduling));
  }

  /** Clic en un carril: propone esa hora, ajustada a 5 minutos, en ese equipo. */
  bookAt(lane: AgendaLane, top: number): void {
    this.book({ equipmentId: lane.id, clock: clockOfMinutes(snapMinutes(this.axis().minutesAt(top))) });
  }

  open(appointment: AgendaAppointment, lane: AgendaLane): void {
    const data: AppointmentDetailData = { appointment, lane, lanes: this.ownLanes(), services: this.services(), canManage: this.canManage() };
    this.dialog
      .open<AppointmentDetailDialogComponent, AppointmentDetailData, AppointmentDetailResult>(AppointmentDetailDialogComponent, {
        data,
        position: { top: '0', right: '0' },
        height: '100vh',
        width: '420px',
        maxWidth: '100vw',
      })
      .afterClosed()
      .subscribe((result) => {
        if (result === 'changed') this.reload();
        if (result === 'reschedule') this.book({ rescheduling: appointment, clock: clockOf(appointment.startsAt, lane.timeZone) });
      });
  }

  private afterBooking(booked: AgendaBooked, moved: boolean): void {
    this.reload();
    const when = clockOf(booked.startsAt, this.timeZone());
    const warning = overlapWarning(booked.warnings ?? [], this.ownLanes(), this.timeZone());
    const message = `${moved ? 'Cita movida' : 'Cita agendada'}: ${when}, ${booked.patientName}.${warning ? ` ${warning}` : ''}`;
    const contact: AgendaContact | null = booked.patientContactId ? { id: booked.patientContactId, name: booked.patientName, phone: booked.patientPhone } : null;
    const again = this.snack.open(message, contact && !moved ? 'Agendar otra para este paciente' : undefined, { duration: warning ? 12_000 : 8_000 });
    if (contact) again.onAction().subscribe(() => this.book({ contact }));
  }

  plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
  }

  /** Hoy, a la hora actual; otro día, a su primera cita. */
  private scrollToFocus(): void {
    const starts = this.lanes().flatMap((view) => view.appointments.map((item) => item.place.top));
    const top = this.nowTop() ?? (starts.length > 0 ? Math.min(...starts) : 0);
    this.board()?.nativeElement.scrollTo({ top: Math.max(0, top - SCROLL_LEAD_MINUTES * this.scale()) });
  }

  private viewOf(lane: AgendaLane, axis: DayAxis): LaneView {
    const shown = gridAppointments(lane);
    const severalServices = new Set(shown.map((a) => a.serviceTypeId)).size > 1;
    const placed = <T,>(place: Place | null, rest: T): (T & { place: Place })[] => (place ? [{ ...rest, place }] : []);
    return {
      lane,
      count: lane.appointments.filter((a) => a.state !== 'cancelled').length,
      range: laneRange(lane),
      closed: closedBands(lane, axis.window).flatMap((band) =>
        placed(bandPlace(band, axis), { id: `${band.from}`, text: `Fuera de horario · ${clockOfMinutes(band.from)}–${clockOfMinutes(band.to)}` }),
      ),
      blocks: lane.blocks.flatMap((block) => placed(blockPlace(block, lane, axis), { id: block.id, text: `Bloqueado: ${block.reason}` })),
      appointments: shown
        .flatMap((appointment) => placed(appointmentPlace(appointment, lane, axis), this.describe(appointment, lane, severalServices)))
        .map((item) => ({ ...item, service: item.service && item.place.height >= TWO_LINES_HEIGHT ? item.service : null })),
    };
  }

  private describe(appointment: AgendaAppointment, lane: AgendaLane, severalServices: boolean): Omit<PlacedAppointment, 'place'> {
    const start = clockOf(appointment.startsAt, lane.timeZone);
    const end = clockOf(appointment.endsAt, lane.timeZone);
    const state = STATE_VIEWS[appointment.state];
    const service = appointment.serviceTypeName;
    const label = [`${start}–${end}`, appointment.patientName, service, appointment.priority === 'urgent' ? 'Urgente' : null, state.label].filter(Boolean).join(', ');
    return { appointment, start, end, state, service: severalServices ? service : null, label };
  }
}
