import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';

/**
 * En qué establecimiento queda un registro. Con uno solo, o al editar, se muestra fijo;
 * con varios, se elige (de inicio, el que está seleccionado arriba).
 */
@Component({
  selector: 'app-establishment-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  template: `
    @if (choosable()) {
      <mat-form-field appearance="outline" class="field">
        <mat-label>Establecimiento</mat-label>
        <mat-select [formControl]="control()">
          @for (e of establishments(); track e.id) { <mat-option [value]="e.id">{{ e.name }}</mat-option> }
        </mat-select>
        @if (elsewhere()) { <mat-hint>Para verlo en la lista, cambia a ese establecimiento arriba.</mat-hint> }
      </mat-form-field>
    } @else {
      <div class="fixed">
        <span class="label">Establecimiento</span>
        <span class="name">{{ name() }}</span>
        @if (locked() && establishments().length > 1) {
          <span class="hint">Si el equipo se movió, dalo de baja aquí y regístralo en el otro.</span>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .field { width: 100%; }
    mat-form-field.field:has(mat-hint) { margin-bottom: 16px; }
    .fixed { display: flex; flex-direction: column; gap: 2px; margin-bottom: 16px; }
    .label { font-size: 12px; color: #475569; }
    .name { font-size: 16px; font-weight: 600; color: #0f172a; }
    .hint { font-size: 12px; color: #475569; }
  `],
})
export class EstablishmentFieldComponent {
  private readonly context = inject(EstablishmentContextService);
  readonly control = input.required<FormControl<string>>();
  /** Al editar no se cambia de establecimiento: la API no lo permite. */
  readonly locked = input(false);

  readonly establishments = this.context.establishments;
  private readonly value = signal('');

  readonly choosable = computed(() => !this.locked() && this.establishments().length > 1);
  readonly name = computed(() => this.establishments().find((e) => e.id === this.value())?.name ?? '—');
  readonly elsewhere = computed(() => this.value() !== this.context.current()?.id);

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      this.value.set(control.value);
      const sub = control.valueChanges.subscribe((v) => this.value.set(v));
      onCleanup(() => sub.unsubscribe());
    });
  }
}
