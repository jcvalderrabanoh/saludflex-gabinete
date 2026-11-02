import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable, map, of, switchMap } from 'rxjs';
import { EstablishmentStatus, FacilityDocument, ObligationDefinition } from '../../core/models/facility.models';
import { AuthService } from '../../core/services/auth.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { confidenceLevel } from '../evidence/analyze-document.helpers';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { CATALOG_PREFIX, obligationGroups } from './documents.helpers';

export interface ReviewDocumentData {
  documents: FacilityDocument[];
  status: EstablishmentStatus;
  catalog: ObligationDefinition[];
}

/**
 * Revisión en serie, uno a la vez («3 de 12»). La persona confirma cada
 * documento: no hay confirmación en lote (junta del 2-nov-2026).
 */
@Component({
  selector: 'app-review-document-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Revisar documento <span class="count">{{ index() + 1 }} de {{ data.documents.length }}</span></h2>
    <mat-dialog-content>
      @if (current(); as d) {
        <div class="preview">
          @if (previewUrl(); as url) {
            @if (d.contentType === 'application/pdf') {
              <a mat-stroked-button [href]="url" target="_blank" rel="noopener">Ver PDF completo</a>
            } @else {
              <img [src]="url" alt="Vista previa del documento" />
            }
          } @else { <span class="muted">Cargando vista previa…</span> }
        </div>
        @if (d.state === 'unknown') {
          <p class="unknown"><strong>Tipo desconocido.</strong> La IA lo describe como: «{{ d.detectedType || 'sin descripción' }}». No coincide con ninguna obligación activa: elige a cuál corresponde.</p>
        } @else if (d.suggestion?.obligation) {
          <p class="badge" [class]="'badge ' + level(d.confidence ?? 0).tone">{{ level(d.confidence ?? 0).label }} · {{ d.confidence }} %</p>
        }
        @for (w of d.suggestion?.warnings ?? []; track w) { <p class="warn" role="status">{{ w }}</p> }
        <form [formGroup]="form" class="form">
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Obligación</mat-label>
            <mat-select formControlName="obligation">
              @for (g of groups(); track g.label) {
                <mat-optgroup [label]="g.label">
                  @for (o of g.options; track o.value) {
                    <mat-option [value]="o.value" [disabled]="isCatalog(o.value) && !canManage">{{ o.label }}</mat-option>
                  }
                </mat-optgroup>
              }
            </mat-select>
            @if (!canManage) { <mat-hint>Para ligar a una obligación del catálogo que no está activa, pídelo al responsable sanitario.</mat-hint> }
          </mat-form-field>
          @if (activating(); as def) {
            <p class="activate wide" role="status">Al ligarlo se activa «{{ def.title }}»: empieza a contar en el semáforo y a mandar avisos de vencimiento.</p>
          }
          <mat-form-field appearance="outline">
            <mat-label>Fecha del documento</mat-label>
            <input matInput type="date" formControlName="performedOn" [max]="data.status.today" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Vigente hasta (si lo dice)</mat-label>
            <input matInput type="date" formControlName="validUntil" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Notas</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
          <p class="trace wide">La IA solo sugiere. Al ligarlo, el documento queda como evidencia permanente y no se puede borrar.</p>
        </form>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      } @else {
        <p>Listo, ya no quedan documentos por revisar.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Salir</button>
      @if (current()) {
        <button mat-button (click)="skip()" [disabled]="busy()">Después</button>
        <button mat-stroked-button color="warn" (click)="discard()" [disabled]="busy()">Descartar</button>
        <button mat-flat-button color="primary" (click)="link()" [disabled]="form.invalid || busy()">
          {{ busy() ? 'Guardando…' : 'Ligar a esta obligación' }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .count { font-size: 14px; color: #64748b; font-weight: 500; margin-left: 8px; }
    .preview { display: flex; justify-content: center; align-items: center; min-height: 120px; max-height: 280px; overflow: hidden; background: #f4f5f7; border-radius: 12px; margin-bottom: 12px; }
    .preview img { max-width: 100%; max-height: 280px; object-fit: contain; }
    .unknown { font-size: 14px; background: #fff3d6; color: #805800; border-radius: 8px; padding: 8px 12px; }
    .badge { display: inline-block; font-size: 13px; font-weight: 600; border-radius: 8px; padding: 2px 10px; margin: 0 0 8px; }
    .badge.high { background: #e7f6ef; color: #08764e; } .badge.medium { background: #fff3d6; color: #805800; } .badge.low { background: #fdecee; color: #b4232c; }
    .warn { margin: 0 0 8px; font-size: 13px; background: #fff3d6; color: #805800; border-radius: 8px; padding: 6px 10px; }
    .activate { font-size: 13px; background: #e4f0ff; color: #0b1b36; border-radius: 8px; padding: 8px 12px; margin: 0 0 8px; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .wide { grid-column: 1 / -1; }
    .trace { font-size: 12px; background: #fffbeb; border: 1px solid #fde68a; color: #78350f; border-radius: 10px; padding: 8px 12px; }
    .error { color: #b91c1c; font-size: 13px; } .muted { color: #64748b; font-size: 13px; }
    @media (max-width: 640px) { .form { grid-template-columns: 1fr; } }
  `],
})
export class ReviewDocumentDialogComponent implements OnDestroy {
  readonly data = inject<ReviewDocumentData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ReviewDocumentDialogComponent, boolean>);
  private readonly api = inject(FacilityApiService);
  readonly canManage = inject(AuthService).hasPermission('facility.manage');
  readonly index = signal(0);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly previewUrl = signal<string | null>(null);
  private changed = false;

  readonly current = computed(() => this.data.documents[this.index()] ?? null);
  readonly groups = computed(() => obligationGroups(this.data.status.obligations, this.data.catalog));
  readonly level = confidenceLevel;

  readonly form = inject(FormBuilder).nonNullable.group({
    obligation: ['', Validators.required],
    performedOn: ['', Validators.required],
    validUntil: [''],
    notes: [''],
  });
  private readonly chosen = toSignal(this.form.controls.obligation.valueChanges, { initialValue: '' });
  readonly activating = computed(() => {
    const value = this.chosen();
    if (!this.isCatalog(value)) return null;
    return this.data.catalog.find((d) => `${CATALOG_PREFIX}${d.key}` === value) ?? null;
  });

  constructor() {
    this.show();
  }

  isCatalog(value: string): boolean {
    return value.startsWith(CATALOG_PREFIX);
  }

  link(): void {
    const d = this.current();
    if (!d) return;
    const { obligation, ...value } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.resolveObligation(obligation)
      .pipe(switchMap((obligationId) => this.api.linkDocument(d.id, { obligationId, ...value })))
      .subscribe({ next: () => this.advance(), error: (err: HttpErrorResponse) => this.fail(err) });
  }

  discard(): void {
    const d = this.current();
    if (!d || !confirm('¿Descartar este documento? Se borra el archivo.')) return;
    this.busy.set(true);
    this.api.discardDocument(d.id).subscribe({ next: () => this.advance(), error: (err: HttpErrorResponse) => this.fail(err) });
  }

  skip(): void {
    this.next();
  }

  close(): void {
    this.ref.close(this.changed);
  }

  ngOnDestroy(): void {
    this.revoke();
  }

  /** Una obligación del catálogo se activa primero (dos pasos explícitos). */
  private resolveObligation(value: string): Observable<string> {
    if (!this.isCatalog(value)) return of(value);
    return this.api
      .activateObligation(this.data.status.establishmentId, { catalogKey: value.slice(CATALOG_PREFIX.length) })
      .pipe(map((o) => o.id));
  }

  private advance(): void {
    this.changed = true;
    this.next();
  }

  private next(): void {
    this.busy.set(false);
    this.index.update((i) => i + 1);
    this.show();
  }

  private fail(err: HttpErrorResponse): void {
    this.busy.set(false);
    this.error.set(apiMessage(err));
  }

  /** Prellena con la sugerencia y carga la vista previa del documento actual. */
  private show(): void {
    this.revoke();
    this.error.set(null);
    const d = this.current();
    if (!d) return;
    const fields = d.suggestion?.fields;
    this.form.reset({
      obligation: d.suggestedObligationId ?? '',
      performedOn: fields?.performedOn ?? '',
      validUntil: fields?.validUntil ?? '',
      notes: fields?.notes ?? '',
    });
    this.api.documentFile(d.id).subscribe((blob) => this.previewUrl.set(URL.createObjectURL(blob)));
  }

  private revoke(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }
}
