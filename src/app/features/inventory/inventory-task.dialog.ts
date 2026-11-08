import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { InventoryItem, InventoryServiceOptions, InventoryTask } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { toTaskInput } from './inventory.helpers';

export interface InventoryTaskData {
  establishmentId: string;
  items: InventoryItem[];
  options: InventoryServiceOptions;
  editing?: InventoryTask;
}

/** La tarea dice qué consume. Editarla aplica a lo que se realice de aquí en adelante. */
@Component({
  selector: 'app-inventory-task-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.editing ? 'Editar tarea' : 'Agregar tarea' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline"><mat-label>Nombre</mat-label><input matInput formControlName="name" maxlength="120" placeholder="Radiografía" /></mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Cuándo consume</mat-label>
          <mat-select formControlName="kind">
            <mat-option value="service">Al realizarse un estudio</mat-option>
            <mat-option value="recurring">Cada cierto tiempo, como la limpieza</mat-option>
          </mat-select>
        </mat-form-field>
        @if (form.controls.kind.value === 'service') {
          <mat-form-field appearance="outline">
            <mat-label>Estudio o categoría</mat-label>
            <mat-select formControlName="target">
              @if (data.options.categories.length) {
                <mat-optgroup label="Categorías">
                  @for (category of data.options.categories; track category.id) { <mat-option [value]="'category:' + category.id">{{ category.name }}</mat-option> }
                </mat-optgroup>
              }
              @if (data.options.studies.length) {
                <mat-optgroup label="Estudios">
                  @for (study of data.options.studies; track study.id) { <mat-option [value]="'study:' + study.id">{{ study.name }}</mat-option> }
                </mat-optgroup>
              }
            </mat-select>
            @if (!data.options.categories.length && !data.options.studies.length) { <mat-hint>Tu cuenta aún no tiene estudios en catálogo.</mat-hint> }
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline"><mat-label>Cada cuántos días</mat-label><input matInput type="number" min="1" step="1" formControlName="periodDays" /></mat-form-field>
        }
        <h3>Qué consume</h3>
        <div formArrayName="lines">
          @for (line of lines.controls; track line; let i = $index) {
            <div class="line" [formGroupName]="i">
              <mat-form-field appearance="outline">
                <mat-label>Insumo</mat-label>
                <mat-select formControlName="itemId">
                  @for (item of data.items; track item.id) { <mat-option [value]="item.id">{{ item.name }}</mat-option> }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="qty"><mat-label>Cantidad</mat-label><input matInput type="number" min="1" step="1" formControlName="quantity" /></mat-form-field>
              <button mat-icon-button type="button" [disabled]="lines.length === 1" (click)="lines.removeAt(i)" aria-label="Quitar insumo"><mat-icon>close</mat-icon></button>
            </div>
          }
        </div>
        <button mat-stroked-button type="button" class="add" (click)="addLine()"><mat-icon>add</mat-icon> Agregar insumo</button>
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !isValid()" (click)="save()">Guardar tarea</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; padding-top: 8px; }
    h3 { margin: 8px 0; font-size: 14px; color: #0f172a; }
    .line { display: grid; grid-template-columns: 1fr 104px 40px; gap: 8px; align-items: start; }
    .add { align-self: flex-start; }
    .field-error { margin: 8px 0 0; font-size: 13px; color: #b91c1c; }
  `],
})
export class InventoryTaskDialogComponent {
  readonly data = inject<InventoryTaskData>(MAT_DIALOG_DATA);
  private readonly api = inject(FacilityApiService);
  private readonly ref = inject(MatDialogRef<InventoryTaskDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly e = this.data.editing;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({
    name: [this.e?.name ?? '', [Validators.required, Validators.pattern(/\S/)]],
    kind: [this.e?.kind ?? ('service' as InventoryTask['kind']), Validators.required],
    target: [this.e?.categoryId ? `category:${this.e.categoryId}` : this.e?.catalogStudyId ? `study:${this.e.catalogStudyId}` : (null as string | null)],
    periodDays: [this.e?.periodDays ?? (null as number | null), Validators.min(1)],
    lines: this.fb.array((this.e?.lines ?? [{ itemId: null, quantity: 1 }]).map((line) => this.lineGroup(line.itemId, line.quantity))),
  });

  get lines(): FormArray {
    return this.form.controls.lines as FormArray;
  }

  private lineGroup(itemId: string | null, quantity: number) {
    return this.fb.group({ itemId: [itemId, Validators.required], quantity: [quantity, [Validators.required, Validators.min(1)]] });
  }

  addLine(): void {
    this.lines.push(this.lineGroup(null, 1));
  }

  isValid(): boolean {
    const { kind, target, periodDays } = this.form.getRawValue();
    return this.form.valid && (kind === 'service' ? !!target : !!periodDays);
  }

  save(): void {
    const input = toTaskInput(this.form.getRawValue());
    const request = this.e ? this.api.updateInventoryTask(this.e.id, input) : this.api.createInventoryTask(this.data.establishmentId, input);
    this.saving.set(true);
    request.subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
