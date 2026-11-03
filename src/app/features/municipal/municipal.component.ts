import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Appointment, Establishment, EstablishmentStatus, EvaluatedObligation, ObligationDefinition } from '../../core/models/facility.models';
import { dueLabel } from '../../core/models/labels';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { addDays } from '../calendar/calendar.helpers';
import { ScheduleAppointmentDialogComponent, ScheduleAppointmentData } from '../calendar/schedule-appointment.dialog';
import { EstablishmentFormDialogComponent } from '../establishments/establishment-form.dialog';
import { RecordEvidenceDialogComponent, apiMessage } from '../evidence/record-evidence.dialog';
import { municipalAppointments, municipalRows } from './municipal.helpers';

/** Hasta dónde se miran las citas municipales: los refrendos suelen ser anuales. */
const MUNICIPAL_HORIZON_DAYS = 365;
const MONTH_SHORT = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' });

/** Trámites del ayuntamiento: licencia de funcionamiento, uso de suelo, protección civil (F12 en Stitch). */
@Component({
  selector: 'app-municipal',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, StatusChipComponent],
  template: `
    <h1>Municipal @if (context.current(); as e) { <span class="place">· {{ e.name }}</span> }</h1>
    <p class="sub">Licencias y trámites del ayuntamiento del establecimiento.</p>

    @if (context.current(); as e) {
      <section class="address">
        <div class="icon-box"><mat-icon>location_city</mat-icon></div>
        <div class="address-text">
          <div class="city">{{ cityLabel(e) }}</div>
          @if (streetLabel(e); as street) { <div class="street"><mat-icon>place</mat-icon>{{ street }}</div> }
          <div class="counts">{{ activeCount() }} trámites activos · {{ rows().length - activeCount() }} sin activar</div>
        </div>
        <button mat-stroked-button (click)="editAddress(e)"><mat-icon>edit_location_alt</mat-icon> Editar domicilio</button>
      </section>
    }

    <h2><mat-icon>assignment</mat-icon> Trámites del ayuntamiento</h2>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @for (row of rows(); track row.definition.key) {
      @if (row.obligation; as o) {
        <article class="item">
          <div class="item-text">
            <app-status-chip [status]="o.status" />
            <div class="title">{{ o.title }}</div>
            <div class="meta">{{ o.currentRecord ? due(o) : 'Sin registro' }}</div>
            <div class="meta muted">{{ o.evidence }}</div>
          </div>
          <div class="item-actions">
            <button mat-flat-button color="primary" (click)="record(o)"><mat-icon>upload_file</mat-icon> Registrar evidencia</button>
            <button mat-stroked-button (click)="scheduleFiling(o)"><mat-icon>event</mat-icon> Programar solicitud</button>
          </div>
        </article>
      } @else {
        <article class="item inactive">
          <div class="item-text">
            <span class="chip-off"><mat-icon>visibility_off</mat-icon> Sin activar</span>
            <div class="title">{{ row.definition.title }}</div>
            <div class="meta">{{ row.definition.note }}</div>
          </div>
          <div class="item-actions">
            <button mat-flat-button color="primary" (click)="activate(row.definition)" [disabled]="activating()"><mat-icon>add_circle</mat-icon> Activar trámite</button>
          </div>
        </article>
      }
    }

    <h2><mat-icon>event</mat-icon> Próximas citas municipales</h2>
    <div class="appointments">
      @for (a of appointments(); track a.id) {
        <article class="appointment">
          @let d = dateParts(a.scheduledOn);
          <div class="date-box" [attr.aria-label]="a.scheduledOn"><span class="m">{{ d.month }}</span><span class="d">{{ d.day }}</span><span class="y">{{ d.year }}</span></div>
          <div class="appointment-text">
            <span class="badge" [class.done]="a.state === 'done'">{{ a.state === 'done' ? 'Hecha' : 'Programada' }}</span>
            @if (a.startTime) { <div class="time">{{ a.startTime }}</div> }
            <div class="title">{{ a.title }}</div>
            @if (a.location) { <div class="meta"><mat-icon>account_balance</mat-icon>{{ a.location }}</div> }
            <div class="appointment-actions">
              @if (a.state === 'scheduled') {
                <button mat-stroked-button (click)="markDone(a)"><mat-icon>check</mat-icon> Marcar como hecha</button>
              }
              <button mat-button (click)="edit(a)"><mat-icon>edit_calendar</mat-icon> Reprogramar</button>
            </div>
          </div>
        </article>
      } @empty {
        <p class="empty">No hay citas municipales programadas. Usa «Programar solicitud» en un trámite activo.</p>
      }
    </div>

    <p class="note"><mat-icon>info</mat-icon> Los requisitos y la vigencia cambian por municipio; confirma con tu ayuntamiento.</p>
  `,
  styles: [`
    h1 { margin: 0; } .place { color: #475569; font-weight: 500; }
    .sub { margin: 4px 0 16px; color: #64748b; font-size: 13px; }
    h2 { display: flex; align-items: center; gap: 8px; font-size: 16px; color: #1e3a8a; margin: 24px 0 10px; }
    .address { display: flex; align-items: center; gap: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; }
    .icon-box { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 12px; background: #dbeafe; color: #1e3a8a; flex: none; }
    .address-text { flex: 1; min-width: 0; } .city { font-weight: 700; font-size: 17px; }
    .street, .meta { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #475569; }
    .street mat-icon, .meta mat-icon, .chip-off mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .counts { font-size: 12px; color: #166534; font-weight: 600; margin-top: 4px; }
    .item { display: flex; align-items: center; gap: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; margin-bottom: 10px; }
    .item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .title { font-weight: 700; font-size: 14px; color: #0f172a; }
    .muted { color: #64748b; }
    .item-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .inactive { background: #f8fafc; border-style: dashed; } .inactive .title { color: #475569; }
    .chip-off { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: #475569; background: #e2e8f0; border-radius: 12px; padding: 2px 10px; }
    .appointments { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
    .appointment { display: flex; gap: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px; }
    .date-box { display: flex; flex-direction: column; align-items: center; align-self: flex-start; width: 64px; border-radius: 12px; background: #eef2fb; color: #1e3a8a; text-align: center; flex: none; padding: 8px 4px; }
    .date-box .m, .date-box .y { font-size: 11px; font-weight: 600; } .date-box .d { font-size: 24px; font-weight: 800; line-height: 1.1; }
    .appointment-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
    .time { font-weight: 700; }
    .badge { font-size: 12px; font-weight: 600; border-radius: 10px; padding: 1px 8px; background: #dbeafe; color: #1e3a8a; }
    .badge.done { background: #dcfce7; color: #166534; }
    .appointment-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
    .note { display: flex; align-items: center; gap: 8px; margin-top: 24px; padding: 12px 16px; border-radius: 12px; background: #eef2fb; color: #334155; font-size: 13px; }
    .empty { color: #64748b; font-size: 13px; }
    .error { color: #b91c1c; font-size: 13px; }
    @media (max-width: 640px) {
      .address, .item { flex-direction: column; align-items: stretch; }
      .item-actions { justify-content: flex-start; }
    }
  `],
})
export class MunicipalComponent {
  readonly context = inject(EstablishmentContextService);
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);

  readonly status = signal<EstablishmentStatus | null>(null);
  readonly catalog = signal<ObligationDefinition[]>([]);
  readonly allAppointments = signal<Appointment[]>([]);
  readonly activating = signal(false);
  readonly error = signal<string | null>(null);

  readonly rows = computed(() => municipalRows(this.catalog(), this.status()?.obligations ?? []));
  readonly activeCount = computed(() => this.rows().filter((r) => r.obligation).length);
  readonly appointments = computed(() => municipalAppointments(this.allAppointments(), this.rows()));

  constructor() {
    this.api.catalog().subscribe((c) => this.catalog.set(c.obligations));
    effect(() => {
      const e = this.context.current();
      if (e) this.load(e.id);
    });
  }

  private load(id: string): void {
    this.api.status(id).subscribe((s) => {
      this.status.set(s);
      this.api.appointments(id, { from: s.today, to: addDays(s.today, MUNICIPAL_HORIZON_DAYS) }).subscribe((list) => this.allAppointments.set(list));
    });
  }

  private reload(): void {
    const id = this.context.current()?.id;
    if (id) this.load(id);
  }

  cityLabel(e: Establishment): string {
    return [e.municipality, e.state].filter(Boolean).join(', ') || 'Sin municipio registrado';
  }

  streetLabel(e: Establishment): string {
    const street = [e.street, e.exteriorNumber].filter(Boolean).join(' ');
    return [street, e.neighborhood, e.postalCode && `C.P. ${e.postalCode}`].filter(Boolean).join(', ');
  }

  due(o: EvaluatedObligation): string {
    return dueLabel(o.daysLeft, o.dueOn);
  }

  dateParts(date: string): { month: string; day: number; year: string } {
    const month = MONTH_SHORT.format(new Date(`${date}T00:00:00Z`)).replace('.', '').toUpperCase();
    return { month, day: Number(date.slice(8)), year: date.slice(0, 4) };
  }

  editAddress(e: Establishment): void {
    this.dialog
      .open(EstablishmentFormDialogComponent, { width: '720px', data: e })
      .afterClosed()
      .subscribe((saved?: Establishment) => {
        if (!saved) return;
        this.api.establishments().subscribe((list) => {
          this.context.setEstablishments(list);
          this.context.select(saved.id);
        });
      });
  }

  activate(definition: ObligationDefinition): void {
    const id = this.context.current()?.id;
    if (!id) return;
    this.activating.set(true);
    this.error.set(null);
    this.api.activateObligation(id, { catalogKey: definition.key }).subscribe({
      next: () => {
        this.activating.set(false);
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.activating.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }

  record(obligation: EvaluatedObligation): void {
    this.dialog
      .open(RecordEvidenceDialogComponent, { width: '560px', data: { obligation, today: this.status()?.today } })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }

  scheduleFiling(obligation: EvaluatedObligation): void {
    const establishment = this.context.current();
    if (!establishment) return;
    this.openDialog({
      establishmentId: establishment.id,
      obligations: this.municipalObligations(),
      date: this.status()?.today ?? '',
      obligationId: obligation.id,
      kind: 'filing',
    });
  }

  edit(appointment: Appointment): void {
    this.openDialog({
      establishmentId: appointment.establishmentId,
      obligations: this.municipalObligations(),
      date: appointment.scheduledOn,
      editing: appointment,
    });
  }

  markDone(appointment: Appointment): void {
    this.api.updateAppointment(appointment.id, { state: 'done' }).subscribe(() => this.reload());
  }

  private municipalObligations(): EvaluatedObligation[] {
    return this.rows().flatMap((r) => (r.obligation ? [r.obligation] : []));
  }

  private openDialog(data: ScheduleAppointmentData): void {
    this.dialog
      .open(ScheduleAppointmentDialogComponent, { width: '560px', data })
      .afterClosed()
      .subscribe((saved) => saved && this.reload());
  }
}
