import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { EstablishmentStatus, FacilityDocument, ObligationDefinition, ObligationKind } from '../../core/models/facility.models';
import { FOLDER_SECTIONS } from '../../core/models/labels';
import { AuthService } from '../../core/services/auth.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { confidenceLevel } from '../evidence/analyze-document.helpers';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { CATALOG_PREFIX, CUSTOM_VALUE, buildLinkInput, initialObligation, obligationGroups } from './documents.helpers';

/** Secciones de la carpeta, en orden, para elegir dónde va una obligación propia. */
const SECTION_OPTIONS = Object.entries(FOLDER_SECTIONS)
  .map(([order, title]) => ({ order: Number(order), title }))
  .sort((a, b) => a.order - b.order);

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
        @if (d.suggestion?.catalogMatch; as match) {
          <p class="found"><strong>No está en tu listado, pero sí en el catálogo.</strong> Es «{{ d.detectedType || match.title }}» y corresponde a «{{ match.title }}»@if (d.suggestion?.section; as sec) {, en la sección «{{ sec.title }}»}.</p>
        } @else if (d.suggestion?.customProposal) {
          <p class="unknown"><strong>No está en el catálogo.</strong> La IA lo describe como «{{ d.detectedType || 'sin descripción' }}»@if (d.suggestion?.section; as sec) { y propone la sección «{{ sec.title }}»}. Si es importante para tu gabinete, regístralo como obligación propia.</p>
        } @else if (d.state === 'unknown') {
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
                    <mat-option [value]="o.value" [disabled]="needsManage(o.value) && !canManage">{{ o.label }}</mat-option>
                  }
                </mat-optgroup>
              }
            </mat-select>
            @if (!canManage) { <mat-hint>Para activar una del catálogo o registrar una obligación propia, pídelo al responsable sanitario.</mat-hint> }
          </mat-form-field>
          @if (activating(); as def) {
            <p class="activate wide" role="status">Al ligarlo se activa «{{ def.title }}»: empieza a contar en el semáforo y a mandar avisos de vencimiento.</p>
            @if (def.subject !== 'establishment') {
              <mat-form-field appearance="outline" class="wide">
                <mat-label>{{ def.subject === 'person' ? '¿De qué persona es?' : '¿De qué equipo es? (sala y número de serie)' }}</mat-label>
                <input matInput formControlName="subjectLabel" maxlength="255" />
              </mat-form-field>
            }
          }
          @if (isCustom()) {
            <p class="activate wide" role="status">Se registra como obligación propia: aparece en su sección y avisa antes de vencer, pero no cuenta en «listo para inspección» porque no la exige el catálogo.</p>
            <mat-form-field appearance="outline" class="wide">
              <mat-label>¿Qué documento es?</mat-label>
              <input matInput formControlName="customTitle" maxlength="255" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Sección de la carpeta</mat-label>
              <mat-select formControlName="customFolderOrder">
                @for (sec of sections; track sec.order) { <mat-option [value]="sec.order">{{ sec.title }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Tipo</mat-label>
              <mat-select formControlName="customKind">
                <mat-option value="document">Documento (con o sin vigencia)</mat-option>
                <mat-option value="periodic">Registro que se repite</mat-option>
              </mat-select>
            </mat-form-field>
            @if (form.controls.customKind.value === 'periodic') {
              <mat-form-field appearance="outline">
                <mat-label>Se repite cada</mat-label>
                <input matInput type="number" min="1" max="120" formControlName="periodEvery" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Unidad</mat-label>
                <mat-select formControlName="periodUnit">
                  <mat-option value="month">Meses</mat-option>
                  <mat-option value="day">Días</mat-option>
                </mat-select>
              </mat-form-field>
            }
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
        <button mat-flat-button color="primary" (click)="link()" [disabled]="form.invalid || !choiceComplete() || busy()">
          {{ busy() ? 'Guardando…' : linkLabel() }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .count { font-size: 14px; color: #64748b; font-weight: 500; margin-left: 8px; }
    .preview { display: flex; justify-content: center; align-items: center; min-height: 120px; max-height: 280px; overflow: hidden; background: #f4f5f7; border-radius: 12px; margin-bottom: 12px; }
    .preview img { max-width: 100%; max-height: 280px; object-fit: contain; }
    .unknown { font-size: 14px; background: #fff3d6; color: #805800; border-radius: 8px; padding: 8px 12px; }
    .found { font-size: 14px; background: #e4f0ff; color: #0b1b36; border-radius: 8px; padding: 8px 12px; }
    .badge { display: inline-block; font-size: 13px; font-weight: 600; border-radius: 8px; padding: 2px 10px; margin: 0 0 8px; }
    .badge.high { background: #e7f6ef; color: #08764e; } .badge.medium { background: #fff3d6; color: #805800; } .badge.low { background: #fdecee; color: #b4232c; }
    .warn { margin: 0 0 8px; font-size: 13px; background: #fff3d6; color: #805800; border-radius: 8px; padding: 6px 10px; }
    .activate { font-size: 13px; background: #e4f0ff; color: #0b1b36; border-radius: 8px; padding: 8px 12px; margin: 0 0 8px; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .wide { grid-column: 1 / -1; }
    .trace { font-size: 12px; background: #fffbeb; border: 1px solid #fde68a; color: #78350f; border-radius: 10px; padding: 8px 12px; }
    .error { color: #b91c1c; font-size: 13px; } .muted { color: #64748b; font-size: 13px; }
    @media (max-width: 767.98px) { .form { grid-template-columns: 1fr; } }
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
  private readonly permissions = inject(PermissionsService);
  /** Con permiso asignado solo se liga a obligaciones propias (el backend responde 403 en las demás). */
  readonly groups = computed(() =>
    obligationGroups(
      this.data.status.obligations.filter((o) => this.permissions.canRecord(o)),
      this.data.catalog,
      this.current()?.suggestion?.catalogMatch?.catalogKey ?? null,
    ),
  );
  readonly sections = SECTION_OPTIONS;
  readonly level = confidenceLevel;

  readonly form = inject(FormBuilder).nonNullable.group({
    obligation: ['', Validators.required],
    performedOn: ['', Validators.required],
    validUntil: [''],
    notes: [''],
    subjectLabel: [''],
    customTitle: [''],
    customFolderOrder: [null as number | null],
    customKind: ['document' as ObligationKind],
    periodEvery: [null as number | null],
    periodUnit: ['month' as 'day' | 'month'],
  });
  private readonly chosen = toSignal(this.form.controls.obligation.valueChanges, { initialValue: '' });
  /** Cambia con cada tecla: la validez de lo extra (persona, propia) depende de todo el formulario. */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly isCustom = computed(() => this.chosen() === CUSTOM_VALUE);
  readonly activating = computed(() => {
    const value = this.chosen();
    if (!this.isCatalog(value)) return null;
    return this.data.catalog.find((d) => `${CATALOG_PREFIX}${d.key}` === value) ?? null;
  });

  /** Lo que pide cada opción además de la fecha: persona o equipo, o los datos de la propia. */
  readonly choiceComplete = computed(() => {
    const v = { ...this.form.getRawValue(), ...this.formValue() };
    const def = this.activating();
    if (def && def.subject !== 'establishment') return !!v.subjectLabel?.trim();
    if (!this.isCustom()) return true;
    if (!v.customTitle?.trim() || v.customFolderOrder == null) return false;
    return v.customKind !== 'periodic' || (!!v.periodEvery && v.periodEvery >= 1);
  });
  readonly linkLabel = computed(() =>
    this.isCustom() ? 'Registrar y ligar' : this.activating() ? 'Activar y ligar' : 'Ligar a esta obligación',
  );

  constructor() {
    this.show();
  }

  isCatalog(value: string): boolean {
    return value.startsWith(CATALOG_PREFIX);
  }

  /** Activar una del catálogo o registrar una propia es de quien administra. */
  needsManage(value: string): boolean {
    return this.isCatalog(value) || value === CUSTOM_VALUE;
  }

  /** Una sola llamada: el backend activa o registra la obligación y liga el documento. */
  link(): void {
    const d = this.current();
    if (!d) return;
    const v = this.form.getRawValue();
    const input = buildLinkInput(v.obligation, v, {
      subjectLabel: v.subjectLabel,
      custom:
        v.customFolderOrder == null
          ? undefined
          : {
              title: v.customTitle,
              folderOrder: v.customFolderOrder,
              kind: v.customKind,
              periodUnit: v.periodUnit,
              periodEvery: v.periodEvery ?? undefined,
            },
    });
    this.busy.set(true);
    this.error.set(null);
    this.api
      .linkDocument(d.id, input)
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
    const proposal = d.suggestion?.customProposal;
    this.form.reset({
      obligation: initialObligation(d),
      performedOn: fields?.performedOn ?? '',
      validUntil: fields?.validUntil ?? '',
      notes: fields?.notes ?? '',
      subjectLabel: '',
      customTitle: proposal?.title ?? d.detectedType ?? '',
      customFolderOrder: proposal ? (d.suggestion?.section?.folderOrder ?? null) : null,
      customKind: proposal?.kind ?? 'document',
      periodEvery: null,
      periodUnit: 'month',
    });
    this.api.documentFile(d.id).subscribe((blob) => this.previewUrl.set(URL.createObjectURL(blob)));
  }

  private revoke(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }
}
