import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import {
  TICKET_DESCRIPTION_MAX,
  TICKET_MESSAGE_MAX,
  TICKET_STATUS_LABELS,
  TICKET_TITLE_MAX,
  TicketDetail,
  TicketMessage,
  TicketStatus,
  TicketSummary,
  TicketType,
} from './help.models';
import { SupportTicketsService } from './support-tickets.service';

type Mode = 'list' | 'new' | 'detail';

const AUTHOR_LABELS: Record<TicketMessage['author'], string> = {
  reporter: 'Tú',
  account_admin: 'Administración de tu cuenta',
  support: 'Soporte',
};

const EVENT_LABELS: Partial<Record<TicketMessage['kind'], string>> = {
  closed: 'Se cerró el reporte',
  reopened: 'Se reabrió el reporte',
  resolved: 'Soporte lo marcó como resuelto',
  in_progress: 'Soporte lo está revisando',
};

const SEND_FAILED = 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.';
const LOAD_FAILED = 'No pudimos cargar tus reportes. Intenta de nuevo en un momento.';

/**
 * «Mis reportes» de Gabinete: lo que reporté, sus respuestas y un formulario
 * para reportar un problema. Solo ve los reportes de Gabinete (jc-core los
 * separa de los de lumen-view por la sesión).
 */
@Component({
  selector: 'app-support-reports',
  standalone: true,
  imports: [DatePipe, FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @switch (mode()) {
      @case ('list') {
        @if (sent()) {
          <p class="ok" role="status">Recibimos tu reporte. Te avisamos aquí cuando soporte responda.</p>
        }
        <button mat-flat-button color="primary" type="button" (click)="openNew()"><mat-icon>add</mat-icon> Reportar un problema</button>
        @if (reports().length === 0) {
          <p class="empty">Aún no has reportado nada en Gabinete.</p>
        }
        <ul class="list">
          @for (r of reports(); track r.id) {
            <li>
              <button type="button" class="item" (click)="open(r)">
                <span class="title">{{ r.title }}</span>
                <span class="meta">{{ statusLabel(r.status) }} · {{ r.createdAt | date: 'd MMM y' }}</span>
                @if (r.unread) {
                  <span class="unread">Novedades</span>
                }
              </button>
            </li>
          }
        </ul>
      }
      @case ('new') {
        <mat-button-toggle-group [(ngModel)]="draft.type" name="type" aria-label="Tipo de reporte">
          <mat-button-toggle value="bug">Algo no funciona</mat-button-toggle>
          <mat-button-toggle value="support">Tengo una duda</mat-button-toggle>
        </mat-button-toggle-group>
        <mat-form-field appearance="outline" class="full">
          <mat-label>¿Qué pasó? (resumen)</mat-label>
          <input matInput name="title" [(ngModel)]="draft.title" [maxlength]="titleMax" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Cuéntanos más</mat-label>
          <textarea matInput name="description" rows="5" [(ngModel)]="draft.description" [maxlength]="descriptionMax"></textarea>
          <mat-hint>No incluyas datos de pacientes.</mat-hint>
        </mat-form-field>
        <div class="row">
          <button mat-stroked-button type="button" (click)="backToList()">Cancelar</button>
          <button mat-flat-button color="primary" type="button" [disabled]="busy() || !draft.title.trim() || !draft.description.trim()" (click)="send()">Enviar reporte</button>
        </div>
      }
      @case ('detail') {
        @if (current(); as t) {
          <button mat-button type="button" class="back" (click)="backToList()"><mat-icon>arrow_back</mat-icon> Mis reportes</button>
          <h3>{{ t.title }}</h3>
          <p class="meta">{{ statusLabel(t.status) }} · {{ t.createdAt | date: 'd MMM y, HH:mm' }}</p>
          <p class="report">{{ t.reportText }}</p>
          <ul class="thread">
            @for (m of t.messages; track m.id) {
              <li [class.support]="m.author === 'support'">
                <strong>{{ authorLabel(m) }}</strong>
                <span>{{ messageText(m) }}</span>
              </li>
            }
          </ul>
          @if (t.canAddInfo) {
            <mat-form-field appearance="outline" class="full">
              <mat-label>Añadir información</mat-label>
              <textarea matInput name="info" rows="3" [(ngModel)]="info" [maxlength]="messageMax"></textarea>
            </mat-form-field>
          }
          <div class="row">
            @if (t.canClose) {
              <button mat-stroked-button type="button" [disabled]="busy()" (click)="close(t)">Cerrar reporte</button>
            }
            @if (t.canAddInfo) {
              <button mat-flat-button color="primary" type="button" [disabled]="busy() || !info.trim()" (click)="addInfo(t)">Añadir</button>
            }
          </div>
        }
      }
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 12px; padding: 16px; overflow-y: auto; }
    .full { width: 100%; }
    .row { display: flex; gap: 8px; justify-content: flex-end; }
    .list, .thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .item { width: 100%; text-align: left; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; font: inherit; min-height: 44px; }
    .item:hover, .item:focus-visible { border-color: #2563c9; }
    .title { font-weight: 600; }
    .meta { font-size: 12px; color: #526077; margin: 0; }
    .unread { align-self: flex-start; font-size: 12px; font-weight: 600; color: #1e3a8a; background: #eef2fb; border-radius: 10px; padding: 0 8px; }
    .empty { color: #526077; }
    .report { white-space: pre-wrap; background: #f8fafc; padding: 8px 12px; border-radius: 8px; margin: 0; }
    .thread li { display: flex; flex-direction: column; padding: 8px 12px; border-radius: 8px; background: #f1f5f9; font-size: 14px; }
    .thread li.support { background: #eef2fb; }
    h3 { margin: 0; }
    .back { align-self: flex-start; }
    .error { color: #b4232c; margin: 0; }
    .ok { color: #08764e; margin: 0; }
  `],
})
export class SupportReportsComponent implements OnInit {
  private readonly tickets = inject(SupportTicketsService);
  private readonly router = inject(Router);
  readonly titleMax = TICKET_TITLE_MAX;
  readonly descriptionMax = TICKET_DESCRIPTION_MAX;
  readonly messageMax = TICKET_MESSAGE_MAX;
  readonly mode = signal<Mode>('list');
  readonly reports = signal<TicketSummary[]>([]);
  readonly current = signal<TicketDetail | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly sent = signal(false);
  draft: { type: TicketType; title: string; description: string } = emptyDraft();
  info = '';

  ngOnInit(): void {
    this.load();
  }

  statusLabel(status: TicketStatus): string {
    return TICKET_STATUS_LABELS[status] ?? status;
  }

  authorLabel(message: TicketMessage): string {
    return AUTHOR_LABELS[message.author] ?? 'Soporte';
  }

  messageText(message: TicketMessage): string {
    return message.body ?? EVENT_LABELS[message.kind] ?? '';
  }

  openNew(): void {
    this.sent.set(false);
    this.error.set(null);
    this.mode.set('new');
  }

  /** Al volver se recarga: abrir un reporte lo marca como leído. */
  backToList(): void {
    this.error.set(null);
    this.mode.set('list');
    this.load();
  }

  open(ticket: TicketSummary): void {
    this.tickets.detail(ticket.id).subscribe({
      next: (detail) => this.showDetail(detail),
      error: () => this.error.set(LOAD_FAILED),
    });
  }

  send(): void {
    this.busy.set(true);
    // Solo la ruta, sin parámetros: nunca viajan datos de la pantalla.
    const route = this.router.url.split('?')[0];
    this.tickets.create({ ...this.draft }, route).subscribe({
      next: (result) => {
        this.busy.set(false);
        if (!result.success) {
          this.error.set(result.error ?? SEND_FAILED);
          return;
        }
        this.draft = emptyDraft();
        this.sent.set(true);
        this.mode.set('list');
        this.load();
      },
      error: () => {
        this.busy.set(false);
        this.error.set(SEND_FAILED);
      },
    });
  }

  addInfo(ticket: TicketDetail): void {
    this.update(this.tickets.addInfo(ticket.id, this.info), () => (this.info = ''));
  }

  close(ticket: TicketDetail): void {
    this.update(this.tickets.close(ticket.id));
  }

  private update(request: ReturnType<SupportTicketsService['close']>, onDone?: () => void): void {
    this.busy.set(true);
    request.subscribe({
      next: (detail) => {
        this.busy.set(false);
        onDone?.();
        this.showDetail(detail);
      },
      error: () => {
        this.busy.set(false);
        this.error.set(SEND_FAILED);
      },
    });
  }

  private showDetail(detail: TicketDetail): void {
    this.error.set(null);
    this.current.set(detail);
    this.mode.set('detail');
  }

  private load(): void {
    this.tickets.mine().subscribe({
      next: (list) => this.reports.set(list),
      error: () => this.error.set(LOAD_FAILED),
    });
  }
}

function emptyDraft(): { type: TicketType; title: string; description: string } {
  return { type: 'bug', title: '', description: '' };
}
