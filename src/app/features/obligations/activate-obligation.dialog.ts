import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { toSignal } from '@angular/core/rxjs-interop';
import { Establishment, ObligationDefinition } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';

export interface ActivateObligationData {
  establishment: Establishment;
  catalog: ObligationDefinition[];
}

@Component({
  selector: 'app-activate-obligation-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Activar obligación</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Obligación</mat-label>
          <mat-select formControlName="catalogKey">
            @for (d of options(); track d.key) {
              <mat-option [value]="d.key">{{ d.title }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (selected(); as d) {
          <p class="hint wide">{{ d.norms.join(' · ') }}@if (d.verification === 'NV') { · periodicidad de planeación: {{ d.note }} }</p>
          @if (d.subject !== 'establishment') {
            <mat-form-field appearance="outline" class="wide">
              <mat-label>{{ d.subject === 'person' ? 'Persona' : 'Equipo (sala y número de serie)' }}</mat-label>
              <input matInput formControlName="subjectLabel" />
            </mat-form-field>
          }
          @if (d.kind === 'periodic') {
            <mat-form-field appearance="outline">
              <mat-label>Cada</mat-label>
              <input matInput type="number" min="1" formControlName="periodEvery" [placeholder]="'' + (d.period?.every ?? '')" />
              <mat-hint>Vacío = {{ d.period?.every }} {{ d.period?.unit === 'day' ? 'día(s)' : 'mes(es)' }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Unidad</mat-label>
              <mat-select formControlName="periodUnit">
                <mat-option value="month">meses</mat-option>
                <mat-option value="day">días</mat-option>
              </mat-select>
            </mat-form-field>
          }
        }
      </form>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!canSave() || saving()">Activar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; min-width: 460px; }
    .wide { grid-column: 1 / -1; }
    .hint { margin: -8px 0 12px; font-size: 12px; color: #64748b; }
    .error { color: #b91c1c; font-size: 13px; }
  `],
})
export class ActivateObligationDialogComponent {
  readonly data = inject<ActivateObligationData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ActivateObligationDialogComponent, boolean>);
  private readonly api = inject(FacilityApiService);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    catalogKey: ['', Validators.required],
    subjectLabel: [''],
    periodEvery: [null as number | null],
    periodUnit: ['month' as 'day' | 'month'],
  });

  /** Las que aplican a los servicios del establecimiento, primero las de persona y equipo. */
  readonly options = computed(() =>
    applicableDefinitions(this.data.catalog, this.data.establishment.services),
  );
  private readonly key = toSignal(this.form.controls.catalogKey.valueChanges, { initialValue: '' });
  private readonly subject = toSignal(this.form.controls.subjectLabel.valueChanges, { initialValue: '' });
  readonly selected = computed(() => this.data.catalog.find((d) => d.key === this.key()) ?? null);
  readonly canSave = computed(() => {
    const d = this.selected();
    return !!d && (d.subject === 'establishment' || !!this.subject()?.trim());
  });

  save(): void {
    const d = this.selected();
    if (!d) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .activateObligation(this.data.establishment.id, {
        catalogKey: d.key,
        subjectLabel: d.subject === 'establishment' ? undefined : v.subjectLabel.trim(),
        ...(d.kind === 'periodic' && v.periodEvery ? { periodEvery: Number(v.periodEvery), periodUnit: v.periodUnit } : {}),
      })
      .subscribe({
        next: () => this.ref.close(true),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(apiMessage(err));
        },
      });
  }
}

export function applicableDefinitions(catalog: ObligationDefinition[], services: string[]): ObligationDefinition[] {
  return catalog
    .filter((d) => d.appliesTo.length === 0 || d.appliesTo.some((s) => services.includes(s)))
    .sort((a, b) => Number(a.subject === 'establishment') - Number(b.subject === 'establishment') || a.folderOrder - b.folderOrder);
}
