import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { TeamPreset } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { PRESETS } from './team.helpers';

/** Invitar a alguien del gabinete: le llega un correo para crear su contraseña. */
@Component({
  selector: 'app-invite-member-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Invitar al equipo</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" autocomplete="name" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Correo</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <mat-error>Escribe un correo válido, por ejemplo ana&#64;clinica.mx</mat-error>
          }
        </mat-form-field>
        <fieldset class="presets">
          <legend>¿Qué podrá hacer?</legend>
          <mat-radio-group formControlName="preset" aria-label="Qué podrá hacer">
            @for (p of presets; track p.value) {
              <mat-radio-button [value]="p.value">
                <span class="preset-label">{{ p.label }}</span>
                <span class="preset-help">{{ p.explanation }}</span>
              </mat-radio-button>
            }
          </mat-radio-group>
        </fieldset>
        <p class="hint">Le llega un correo para crear su contraseña. Usuarios ilimitados: el precio es por establecimiento.</p>
      </form>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
        {{ saving() ? 'Enviando…' : 'Enviar invitación' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr; gap: 0; }
    .presets { border: 0; padding: 0; margin: 0 0 8px; }
    legend { font-size: 14px; font-weight: 600; color: #3c4757; margin-bottom: 4px; }
    mat-radio-group { display: flex; flex-direction: column; gap: 4px; }
    mat-radio-button { min-height: 44px; }
    .preset-label { display: block; font-weight: 600; }
    .preset-help { display: block; font-size: 14px; color: #6b7684; }
    .hint { font-size: 14px; color: #6b7684; margin: 0; }
    .error { color: #b4232c; font-size: 14px; }
  `],
})
export class InviteMemberDialogComponent {
  private readonly ref = inject(MatDialogRef<InviteMemberDialogComponent, boolean>);
  private readonly api = inject(FacilityApiService);
  readonly presets = PRESETS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    preset: ['responsable' as TeamPreset, Validators.required],
  });

  save(): void {
    const value = this.form.getRawValue();
    const input = { name: value.name.trim(), email: value.email.trim(), preset: value.preset };
    this.form.patchValue(input);
    if (this.form.invalid || !input.name) {
      this.form.markAllAsTouched();
      this.error.set('Falta el nombre o el correo no es válido. Revísalos y vuelve a enviar.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api.inviteTeamMember(input).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
