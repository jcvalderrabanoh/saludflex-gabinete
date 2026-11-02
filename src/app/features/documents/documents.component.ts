import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom, forkJoin } from 'rxjs';
import { FacilityDocument } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { IN_PROGRESS, REVIEWABLE, documentCounters, runLimited, stateLabel } from './documents.helpers';
import { ReviewDocumentDialogComponent } from './review-document.dialog';

/** Archivos por carga (CFO, junta del 2-nov-2026). */
export const MAX_FILES_PER_UPLOAD = 50;
/** Subidas en paralelo: una petición por archivo para no cargar todo en memoria. */
const UPLOAD_CONCURRENCY = 3;
/** Cada cuánto se refresca la bandeja mientras hay documentos leyéndose. */
const POLL_MS = 5000;

interface UploadLine {
  name: string;
  outcome: string;
}

/** Bandeja de documentos: subir muchos, que la IA los lea y revisarlos uno a uno. */
@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatProgressBarModule],
  template: `
    <section class="head">
      <div>
        <h1>Documentos</h1>
        <p class="sub">Sube todos tus documentos: los leemos, te proponemos a qué obligación corresponde cada uno y tú confirmas.</p>
      </div>
    </section>

    <section class="card notice">
      <p><strong>Sube solo documentos del establecimiento:</strong> licencias, avisos, constancias, mantenimientos, capacitación y reportes de proveedores. No subas expedientes, resultados, recetas ni identificaciones de pacientes.</p>
      <p class="small">Para leerlos y clasificarlos, los procesa Google (Gemini) por cuenta de SaludFlex. Los que no ligues se eliminan en 30 días.</p>
      <mat-checkbox [(ngModel)]="acknowledged">Confirmo que estos documentos no contienen datos de pacientes</mat-checkbox>
      <label class="upload" [class.disabled]="!acknowledged || uploading()">
        <input type="file" multiple accept="image/*,application/pdf" [disabled]="!acknowledged || uploading()" (change)="pick($event)" />
        <span class="cta">{{ uploading() ? 'Subiendo…' : 'Subir varios archivos' }}</span>
        <span class="small">Fotos o PDF, hasta {{ maxFiles }} por carga y 10 páginas por PDF</span>
      </label>
      @if (uploading()) { <mat-progress-bar mode="determinate" [value]="progress()" /> }
      @for (line of uploadLines(); track line.name) { <p class="line">{{ line.name }}: {{ line.outcome }}</p> }
    </section>

    @if (counters(); as c) {
      <section class="counters" aria-label="Resumen de la bandeja">
        <div class="counter"><span>Leyendo</span><b>{{ c.reading }}</b></div>
        <div class="counter review"><span>Por revisar</span><b>{{ c.review }}</b></div>
        <div class="counter unknown"><span>Tipo desconocido</span><b>{{ c.unknown }}</b></div>
        <div class="counter bad"><span>Con problema</span><b>{{ c.problems }}</b></div>
        <div class="counter ok"><span>Ligados</span><b>{{ c.linked }}</b></div>
      </section>
    }
    <div class="actions">
      <button mat-flat-button color="primary" (click)="review()" [disabled]="reviewable().length === 0">
        Revisar {{ reviewable().length }} {{ reviewable().length === 1 ? 'documento' : 'documentos' }}
      </button>
    </div>

    <section class="list">
      @for (d of documents(); track d.id) {
        <article class="row">
          <mat-icon aria-hidden="true">{{ state(d).icon }}</mat-icon>
          <div class="text">
            <div class="title">{{ d.originalName || 'Documento' }}</div>
            <div class="meta">
              <span class="chip" [class]="'chip ' + state(d).tone">{{ state(d).label }}</span>
              @if (d.detectedType) { · {{ d.detectedType }} }
              @if (d.purgeAfter && d.state !== 'linked') { · se elimina el {{ d.purgeAfter.slice(0, 10) }} }
            </div>
          </div>
          @if (d.state === 'failed') { <button mat-button (click)="retry(d)">Reintentar</button> }
        </article>
      } @empty {
        <p class="empty">Todavía no hay documentos en la bandeja.</p>
      }
    </section>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  `,
  styles: [`
    h1 { margin: 0; } .sub { color: #64748b; margin: 4px 0 16px; }
    .card { background: #fff; border: 1px solid #d9dee5; border-radius: 16px; padding: 16px; max-width: 900px; }
    .notice p { margin: 0 0 8px; font-size: 14px; } .small { font-size: 12px; color: #64748b; }
    .upload { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px; border: 2px dashed #93c5fd; border-radius: 12px; background: #eff6ff; cursor: pointer; margin: 12px 0 8px; min-height: 44px; }
    .upload.disabled { opacity: .55; cursor: not-allowed; }
    .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .cta { color: #0067d6; font-weight: 600; }
    .line { font-size: 12px; color: #3c4757; margin: 2px 0; }
    .counters { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 16px 0; max-width: 900px; }
    .counter { border: 1px solid #d9dee5; border-radius: 12px; padding: 8px 12px; background: #fff; display: flex; flex-direction: column; font-size: 13px; }
    .counter b { font-size: 22px; } .counter.review { border-color: #93c5fd; } .counter.unknown { border-color: #e8a100; } .counter.bad { border-color: #e5484d; } .counter.ok { border-color: #1fa971; }
    .actions { margin-bottom: 12px; }
    .list { max-width: 900px; }
    .row { display: flex; gap: 12px; align-items: center; padding: 10px 14px; border: 1px solid #d9dee5; border-radius: 12px; margin-bottom: 8px; background: #fff; }
    .text { flex: 1; min-width: 0; } .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { font-size: 12px; color: #6b7684; }
    .chip { border-radius: 8px; padding: 1px 8px; font-weight: 600; }
    .chip.neutral { background: #f4f5f7; color: #3c4757; } .chip.progress { background: #e4f0ff; color: #0b1b36; } .chip.good { background: #e7f6ef; color: #08764e; } .chip.warn { background: #fff3d6; color: #805800; } .chip.bad { background: #fdecee; color: #b4232c; }
    .empty { color: #64748b; } .error { color: #b91c1c; }
  `],
})
export class DocumentsComponent {
  private readonly api = inject(FacilityApiService);
  private readonly context = inject(EstablishmentContextService);
  private readonly dialog = inject(MatDialog);
  readonly maxFiles = MAX_FILES_PER_UPLOAD;
  readonly documents = signal<FacilityDocument[]>([]);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly uploadLines = signal<UploadLine[]>([]);
  readonly error = signal<string | null>(null);
  acknowledged = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly counters = computed(() => documentCounters(this.documents()));
  readonly reviewable = computed(() => this.documents().filter((d) => REVIEWABLE.includes(d.state)));
  readonly state = (d: FacilityDocument) => stateLabel(d.state);

  constructor() {
    effect(() => {
      const e = this.context.current();
      if (e) this.load(e.id);
    });
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  load(establishmentId: string): void {
    this.api.documents(establishmentId).subscribe({
      next: (list) => {
        this.documents.set(list);
        this.schedulePoll(establishmentId, list);
      },
      error: (err: HttpErrorResponse) => this.error.set(apiMessage(err)),
    });
  }

  async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, MAX_FILES_PER_UPLOAD);
    input.value = '';
    const establishmentId = this.context.current()?.id;
    if (!establishmentId || files.length === 0) return;
    this.uploading.set(true);
    this.uploadLines.set([]);
    let done = 0;
    await runLimited(files, UPLOAD_CONCURRENCY, async (file) => {
      const outcome = await this.uploadOne(establishmentId, file);
      done++;
      this.progress.set(Math.round((done / files.length) * 100));
      if (outcome) this.uploadLines.update((lines) => [...lines, { name: file.name, outcome }]);
    });
    this.uploading.set(false);
    this.load(establishmentId);
  }

  review(): void {
    const status$ = this.api.status(this.context.current()?.id as string);
    forkJoin([status$, this.api.catalog()]).subscribe(([status, catalog]) => {
      this.dialog
        .open(ReviewDocumentDialogComponent, {
          width: '640px',
          data: { documents: this.reviewable(), status, catalog: catalog.obligations },
        })
        .afterClosed()
        .subscribe(() => this.load(status.establishmentId));
    });
  }

  retry(d: FacilityDocument): void {
    this.api.retryDocument(d.id).subscribe(() => this.load(d.establishmentId));
  }

  /** Solo reporta lo que no salió normal (duplicado o error); lo demás se ve en la lista. */
  private async uploadOne(establishmentId: string, file: File): Promise<string | null> {
    try {
      const { duplicate } = await firstValueFrom(this.api.uploadDocument(establishmentId, file));
      return duplicate ? 'ya lo habías subido; no lo leemos otra vez' : null;
    } catch (err) {
      return apiMessage(err as HttpErrorResponse);
    }
  }

  private schedulePoll(establishmentId: string, list: FacilityDocument[]): void {
    this.stopPolling();
    if (list.some((d) => IN_PROGRESS.includes(d.state))) {
      this.timer = setTimeout(() => this.load(establishmentId), POLL_MS);
    }
  }

  private stopPolling(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
