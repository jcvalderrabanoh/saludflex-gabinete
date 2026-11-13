import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, of, switchMap, tap } from 'rxjs';
import { AgendaAppointment, AgendaAppointmentState, AgendaDay, AgendaLane } from '../../core/models/agenda.models';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import {
  DEFAULT_TIME_ZONE,
  Place,
  STATE_VIEWS,
  StateView,
  appointmentPlace,
  bandPlace,
  blockPlace,
  clockOf,
  clockOfMinutes,
  closedBands,
  daySummary,
  gridAppointments,
  gridWindow,
  hourMarks,
  longDate,
  nowMinutes,
  pixelsPerMinute,
  shiftDate,
  todayIn,
} from './agenda.helpers';

interface PlacedAppointment {
  appointment: AgendaAppointment;
  place: Place;
  time: string;
  state: StateView;
  /** El servicio solo se escribe si en el carril hay más de uno y la cita tiene alto para dos líneas. */
  service: string | null;
  label: string;
}

interface PlacedBand {
  place: Place;
  text: string;
}

interface LaneView {
  lane: AgendaLane;
  count: number;
  closed: PlacedBand[];
  blocks: PlacedBand[];
  appointments: PlacedAppointment[];
}

/** Alto a partir del cual una cita muestra una segunda línea. */
const TWO_LINES_HEIGHT = 44;
/** Alto a partir del cual una franja cerrada o bloqueada lleva su rótulo. */
const BAND_LABEL_HEIGHT = 20;
const REFRESH_NOW_EVERY_MS = 60_000;
/** Al abrir un día, la parrilla se desplaza hasta un poco antes de lo que importa. */
const SCROLL_LEAD_MINUTES = 45;

const LEGEND: readonly AgendaAppointmentState[] = ['scheduled', 'arrived', 'attended', 'no_show'];

/** Agenda del día: un carril por equipo del establecimiento, con su horario, bloqueos y citas. */
@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <header class="head">
      <h1>Agenda</h1>
      <div class="days" role="group" aria-label="Cambiar de día">
        <button mat-stroked-button (click)="move(-1)"><mat-icon>chevron_left</mat-icon> Anterior</button>
        <button mat-stroked-button (click)="goToday()" [disabled]="isToday()">Hoy</button>
        <button mat-stroked-button (click)="move(1)">Siguiente <mat-icon iconPositionEnd>chevron_right</mat-icon></button>
      </div>
      <p class="date" aria-live="polite">{{ dateLabel() }}</p>
    </header>

    @if (error()) {
      <div class="notice" role="alert">
        <p>No pudimos cargar la agenda de este día.</p>
        <button mat-stroked-button (click)="reload()"><mat-icon>refresh</mat-icon> Volver a intentar</button>
      </div>
    } @else if (loading() && !day()) {
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
              <span>{{ view.lane.room ? view.lane.room + ' · ' : '' }}{{ plural(view.count, 'cita', 'citas') }}</span>
            </div>
          }
        </div>

        <div class="row body" [style.height.px]="height()">
          <div class="axis" aria-hidden="true">
            @for (mark of marks(); track mark.minutes) {
              <span class="mark" [class.half]="!mark.onTheHour" [style.top.px]="(mark.minutes - window().from) * scale()">{{ mark.label }}</span>
            }
            @if (nowTop() !== null) {
              <span class="now-label" [style.top.px]="nowTop()">{{ nowClock() }}</span>
            }
          </div>

          @for (view of lanes(); track view.lane.id) {
            <section class="lane" [attr.aria-label]="view.lane.name" [style.--hour.px]="60 * scale()">
              @for (band of view.closed; track band.place.top) {
                <div class="band closed" [style.top.px]="band.place.top" [style.height.px]="band.place.height">
                  @if (band.place.height >= bandLabelHeight) { <span>{{ band.text }}</span> }
                </div>
              }
              @for (band of view.blocks; track band.place.top) {
                <div class="band blocked" [style.top.px]="band.place.top" [style.height.px]="band.place.height" [attr.title]="band.text">
                  @if (band.place.height >= bandLabelHeight) { <span><mat-icon aria-hidden="true">block</mat-icon> {{ band.text }}</span> }
                </div>
              }
              @if (nowTop() !== null) {
                <div class="now" [style.top.px]="nowTop()" aria-hidden="true"></div>
              }
              <ul>
                @for (item of view.appointments; track item.appointment.id) {
                  <li
                    class="appointment"
                    [class]="'appointment ' + item.appointment.state"
                    [class.urgent]="item.appointment.priority === 'urgent'"
                    [style.top.px]="item.place.top"
                    [style.height.px]="item.place.height"
                    [attr.aria-label]="item.label"
                  >
                    <div class="line" aria-hidden="true">
                      <span class="time">{{ item.time }}</span>
                      <span class="patient">{{ item.appointment.patientName }}</span>
                      @if (item.appointment.priority === 'urgent') {
                        <span class="tag" title="Urgente"><mat-icon>priority_high</mat-icon><span class="wide">Urgente</span></span>
                      }
                      <span class="state" [attr.title]="item.state.label"><mat-icon>{{ item.state.icon }}</mat-icon><span class="wide">{{ item.state.label }}</span></span>
                    </div>
                    @if (item.service) { <div class="service" aria-hidden="true">{{ item.service }}</div> }
                  </li>
                }
              </ul>
            </section>
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
    .date { margin: 0; font-size: 18px; font-weight: 600; }
    .summary, .muted { margin: 8px 0 16px; font-size: 14px; color: #475569; }
    .notice { margin-top: 16px; padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .notice p { margin: 0 0 12px; }

    .board { --axis: 64px; overflow: auto; max-height: calc(100vh - 250px); background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .board.stale { opacity: 0.55; }
    .row { display: grid; grid-template-columns: var(--axis) repeat(var(--lanes), minmax(220px, 1fr)); min-width: min-content; }
    .names { position: sticky; top: 0; z-index: 4; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .corner { position: sticky; left: 0; z-index: 1; background: #f8fafc; padding: 12px 8px; font-size: 12px; font-weight: 600; color: #526077; text-align: right; }
    .name { padding: 10px 12px; border-left: 1px solid #e2e8f0; }
    .name strong { display: block; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name span { font-size: 12px; color: #526077; }

    .axis { position: sticky; left: 0; z-index: 3; background: #fff; }
    .mark { position: absolute; right: 8px; transform: translateY(2px); font-size: 12px; font-weight: 600; color: #334155; }
    .mark.half { font-weight: 400; color: #94a3b8; }
    .now-label { position: absolute; right: 4px; transform: translateY(-50%); padding: 1px 6px; border-radius: 6px; background: #2563c9; color: #fff; font-size: 11px; font-weight: 700; }

    .lane {
      position: relative; container-type: inline-size; border-left: 1px solid #e2e8f0;
      background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(#f1f5f9 1px, transparent 1px);
      background-size: 100% var(--hour), 100% calc(var(--hour) / 2);
    }
    .lane ul { list-style: none; margin: 0; padding: 0; }
    .band { position: absolute; left: 0; right: 0; overflow: hidden; font-size: 12px; color: #526077; }
    .band span { display: flex; align-items: center; gap: 4px; padding: 2px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .closed { background: #f1f5f9; }
    .blocked { z-index: 1; background: repeating-linear-gradient(135deg, #fef3c7 0 8px, #fde9a8 8px 16px); color: #713f12; font-weight: 600; }
    .now { position: absolute; left: 0; right: 0; z-index: 1; border-top: 2px solid #2563c9; }

    .appointment {
      position: absolute; left: 4px; right: 4px; z-index: 2; box-sizing: border-box; overflow: hidden;
      padding: 0 8px; border: 1px solid #cbd5e1; border-left: 4px solid #334155; border-radius: 6px; background: #fff; font-size: 13px;
    }
    .line { display: flex; align-items: center; gap: 8px; height: 20px; line-height: 20px; }
    .time { flex: none; font-variant-numeric: tabular-nums; color: #334155; }
    .patient { flex: 1; min-width: 3ch; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .state, .tag { flex: none; display: inline-flex; align-items: center; gap: 2px; font-size: 12px; }
    .band mat-icon, .state mat-icon, .tag mat-icon, .legend mat-icon { flex: none; font-size: 16px; width: 16px; height: 16px; }
    .tag { color: #b91c1c; font-weight: 700; }
    /* Carril angosto: el nombre manda; estado y urgencia quedan en su icono. */
    .service { font-size: 12px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .appointment.urgent { border-left-color: #b91c1c; }
    .appointment.arrived { background: #ecfdf5; border-color: #86efac; border-left-color: #15803d; }
    .arrived .state, .legend .arrived { color: #166534; font-weight: 700; }
    .appointment.attended { background: #f8fafc; border-left-color: #94a3b8; color: #64748b; }
    .appointment.attended .time, .appointment.attended .patient { color: #64748b; font-weight: 400; }
    .appointment.no_show { border-style: dashed; border-left-style: solid; border-left-color: #94a3b8; color: #64748b; }
    .appointment.no_show .patient { font-weight: 400; text-decoration: line-through; }
    .no_show .state, .legend .no_show, .legend .urgent { color: #b91c1c; }
    @container (max-width: 440px) { .tag .wide { display: none; } }
    @container (max-width: 360px) { .wide { display: none; } }

    .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 12px 0 0; padding: 0; font-size: 13px; color: #334155; }
    .legend li { display: inline-flex; align-items: center; gap: 4px; }
    .swatch { width: 16px; height: 12px; border-radius: 3px; border: 1px solid #cbd5e1; }

    @media (max-width: 767.98px) {
      .board { --axis: 52px; max-height: calc(100vh - 270px); }
      .days { width: 100%; }
      .days button { flex: 1; min-width: 0; }
    }
  `],
})
export class AgendaComponent {
  private readonly api = inject(AgendaApiService);
  private readonly context = inject(EstablishmentContextService);

  readonly views = STATE_VIEWS;
  readonly legend = LEGEND;
  readonly bandLabelHeight = BAND_LABEL_HEIGHT;

  readonly date = signal(todayIn(DEFAULT_TIME_ZONE));
  readonly day = signal<AgendaDay | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  /** Avanza cada minuto para mover la línea de «ahora». */
  private readonly now = signal(new Date());
  private readonly reloads = signal(0);
  private readonly board = viewChild<ElementRef<HTMLElement>>('board');
  private readonly injector = inject(Injector);

  /** Los equipos del establecimiento elegido en la barra superior. */
  private readonly ownLanes = computed(() => {
    const establishmentId = this.context.current()?.id;
    return (this.day()?.resources ?? []).filter((lane) => !establishmentId || lane.establishmentId === establishmentId);
  });
  private readonly timeZone = computed(() => this.ownLanes()[0]?.timeZone ?? DEFAULT_TIME_ZONE);

  readonly window = computed(() => gridWindow(this.ownLanes()));
  readonly scale = computed(() => pixelsPerMinute(this.ownLanes()));
  readonly height = computed(() => (this.window().to - this.window().from) * this.scale());
  readonly marks = computed(() => hourMarks(this.window()));
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
  readonly lanes = computed(() => this.ownLanes().map((lane) => this.viewOf(lane)));
  readonly dateLabel = computed(() => longDate(this.date()));
  readonly isToday = computed(() => this.date() === todayIn(this.timeZone(), this.now()));

  private readonly nowMinute = computed(() => {
    const [lane] = this.ownLanes();
    const minutes = lane ? nowMinutes(lane, this.date(), this.now()) : null;
    return minutes !== null && minutes >= this.window().from && minutes <= this.window().to ? minutes : null;
  });
  readonly nowTop = computed(() => {
    const minutes = this.nowMinute();
    return minutes === null ? null : (minutes - this.window().from) * this.scale();
  });
  readonly nowClock = computed(() => clockOfMinutes(this.nowMinute() ?? 0));

  constructor() {
    const request = computed(() => ({ date: this.date(), attempt: this.reloads() }));
    toObservable(request)
      .pipe(
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
        afterNextRender(() => this.scrollToFocus(), { injector: this.injector });
      });

    const timer = setInterval(() => this.now.set(new Date()), REFRESH_NOW_EVERY_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  move(days: number): void {
    this.date.update((date) => shiftDate(date, days));
  }

  goToday(): void {
    this.date.set(todayIn(this.timeZone(), new Date()));
  }

  reload(): void {
    this.reloads.update((n) => n + 1);
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

  private viewOf(lane: AgendaLane): LaneView {
    const window = this.window();
    const scale = this.scale();
    const shown = gridAppointments(lane);
    const severalServices = new Set(shown.map((a) => a.serviceTypeId)).size > 1;
    const placed = <T,>(place: Place | null, rest: T): (T & { place: Place })[] => (place ? [{ ...rest, place }] : []);
    return {
      lane,
      count: lane.appointments.filter((a) => a.state !== 'cancelled').length,
      closed: closedBands(lane, window).flatMap((band) => placed(bandPlace(band, window, scale), { text: 'Fuera de horario' })),
      blocks: lane.blocks.flatMap((block) => placed(blockPlace(block, lane, window, scale), { text: `Bloqueado: ${block.reason}` })),
      appointments: shown.flatMap((appointment) => placed(appointmentPlace(appointment, lane, window, scale), this.describe(appointment, lane, severalServices))).map((item) => ({
        ...item,
        service: item.service && item.place.height >= TWO_LINES_HEIGHT ? item.service : null,
      })),
    };
  }

  private describe(appointment: AgendaAppointment, lane: AgendaLane, severalServices: boolean): Omit<PlacedAppointment, 'place'> {
    const time = `${clockOf(appointment.startsAt, lane.timeZone)}–${clockOf(appointment.endsAt, lane.timeZone)}`;
    const state = STATE_VIEWS[appointment.state];
    const service = appointment.serviceTypeName;
    const label = [time, appointment.patientName, service, appointment.priority === 'urgent' ? 'Urgente' : null, state.label].filter(Boolean).join(', ');
    return { appointment, time, state, service: severalServices ? service : null, label };
  }
}
