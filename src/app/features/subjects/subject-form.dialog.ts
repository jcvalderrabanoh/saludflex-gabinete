import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable } from 'rxjs';
import { Equipment, Personnel, ServiceType, StaffRole, SubjectResult } from '../../core/models/facility.models';
import { MODALITY_LABELS, ROLE_LABELS } from '../../core/models/labels';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { EstablishmentFieldComponent } from '../../shared/components/establishment-field.component';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { LinkOption, linkOptions, prefillFromUser } from './link-user.helpers';

export type SubjectFormData =
  | { kind: 'equipment'; establishmentId: string; current?: Equipment }
  | { kind: 'person'; establishmentId: string; current?: Personnel };

/** Lo que devuelve el diálogo al guardar. */
export interface SubjectFormResult {
  activated: number;
  missingService?: ServiceType | null;
}

/** Alta y edición de un equipo o una persona. Devuelve cuántas obligaciones se activaron y si falta un servicio. */
@Component({
  selector: 'app-subject-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule, EstablishmentFieldComponent],
  template: `
    <h2 mat-dialog-title>{{ title() }}</h2>
    <mat-dialog-content>
      @if (data.kind === 'equipment') {
        <form [formGroup]="equipment" class="form">
          <app-establishment-field class="wide" [control]="equipment.controls.establishmentId" [locked]="!!data.current" />
          <mat-form-field appearance="outline" class="wide"><mat-label>Nombre</mat-label><input matInput formControlName="name" placeholder="Sala 1 · Rayos X" /></mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Modalidad</mat-label>
            <mat-select formControlName="modality">
              @for (m of modalities; track m[0]) { <mat-option [value]="m[0]">{{ m[1] }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Número de serie</mat-label><input matInput formControlName="serialNumber" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Marca</mat-label><input matInput formControlName="manufacturer" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Modelo</mat-label><input matInput formControlName="model" /></mat-form-field>
          <mat-form-field appearance="outline" class="wide"><mat-label>Sala</mat-label><input matInput formControlName="room" /></mat-form-field>
        </form>
        <p class="hint">Al registrarlo se activan su mantenimiento y, si emite radiación, su control de calidad.</p>
      } @else {
        <form [formGroup]="person" class="form">
          @if (!usersFailed()) {
            <mat-form-field appearance="outline" class="wide">
              <mat-label>Usuario de lumen-view (opcional)</mat-label>
              <mat-select formControlName="userId" (selectionChange)="onUserChosen($event.value)">
                <mat-option [value]="null">Sin usuario</mat-option>
                @for (o of userOptions(); track o.user.id) {
                  <mat-option [value]="o.user.id" [disabled]="o.taken">{{ o.label }}{{ o.taken ? ' · ya registrado aquí' : '' }}</mat-option>
                }
              </mat-select>
              <mat-hint>Llenamos su nombre y, si firma informes, su cédula.</mat-hint>
            </mat-form-field>
          } @else {
            <p class="hint wide" role="status">No pudimos cargar los usuarios de la cuenta. Puedes registrar a la persona sin vincularla y hacerlo después.</p>
          }
          <mat-form-field appearance="outline" class="wide"><mat-label>Nombre completo</mat-label><input matInput formControlName="fullName" /></mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Rol</mat-label>
            <mat-select formControlName="role">
              @for (r of roles; track r[0]) { <mat-option [value]="r[0]">{{ r[1] }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Cédula profesional</mat-label><input matInput formControlName="professionalLicense" /></mat-form-field>
          <mat-checkbox class="wide" formControlName="occupationallyExposed">Personal ocupacionalmente expuesto a radiación (POE)</mat-checkbox>
        </form>
        <p class="hint">Si es POE se activan su dosimetría y su capacitación; si es clínico, su título y cédula.</p>
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="invalid() || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; min-width: 480px; padding-top: 8px; }
    @media (max-width: 767.98px) { .form { grid-template-columns: 1fr; min-width: 0; } }
    .wide { grid-column: 1 / -1; margin-bottom: 8px; }
    mat-form-field.wide:has(mat-hint) { margin-bottom: 16px; }
    .hint { font-size: 12px; color: #64748b; margin: 4px 0 0; }
    .error { color: #b91c1c; font-size: 13px; }
  `],
})
export class SubjectFormDialogComponent {
  readonly data = inject<SubjectFormData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<SubjectFormDialogComponent, number>);
  private readonly api = inject(FacilityApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly modalities = Object.entries(MODALITY_LABELS);
  readonly roles = Object.entries(ROLE_LABELS);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly userOptions = signal<LinkOption[]>([]);
  readonly usersFailed = signal(false);

  private readonly eq = this.data.kind === 'equipment' ? this.data.current : undefined;
  private readonly pe = this.data.kind === 'person' ? this.data.current : undefined;

  readonly equipment = this.fb.group({
    name: [this.eq?.name ?? '', Validators.required],
    modality: [this.eq?.modality ?? 'xray', Validators.required],
    serialNumber: [this.eq?.serialNumber ?? ''],
    manufacturer: [this.eq?.manufacturer ?? ''],
    model: [this.eq?.model ?? ''],
    room: [this.eq?.room ?? ''],
    establishmentId: [this.eq?.establishmentId ?? this.data.establishmentId],
  });

  readonly person = this.fb.group({
    fullName: [this.pe?.fullName ?? '', Validators.required],
    role: [this.pe?.role ?? 'tecnico-radiologo', Validators.required],
    professionalLicense: [this.pe?.professionalLicense ?? '', Validators.pattern(/^\d{7,8}$/)],
    occupationallyExposed: [this.pe?.occupationallyExposed ?? false],
    userId: this.fb.control<string | null>(this.pe?.userId ?? null),
  });

  constructor() {
    if (this.data.kind === 'person') this.loadLinkableUsers(this.data.establishmentId);
  }

  private loadLinkableUsers(establishmentId: string): void {
    this.api.linkableUsers(establishmentId).subscribe({
      next: (users) => this.userOptions.set(linkOptions(users, this.pe?.id)),
      error: () => this.usersFailed.set(true),
    });
  }

  /** Llena solo lo que está vacío con los datos de su usuario. */
  onUserChosen(userId: string | null): void {
    const option = this.userOptions().find((o) => o.user.id === userId);
    if (!option) return;
    const { fullName, role, professionalLicense } = this.person.getRawValue();
    this.person.patchValue(prefillFromUser(option.user, { fullName, role: role as StaffRole, professionalLicense }, !this.pe));
  }

  title(): string {
    const verb = this.data.current ? 'Editar' : 'Registrar';
    return `${verb} ${this.data.kind === 'equipment' ? 'equipo' : 'persona'}`;
  }

  invalid(): boolean {
    return this.data.kind === 'equipment' ? this.equipment.invalid : this.person.invalid;
  }

  save(): void {
    const d = this.data;
    let request: Observable<SubjectResult<unknown>>;
    if (d.kind === 'equipment') {
      const { establishmentId, ...v } = this.equipment.getRawValue();
      request = d.current ? this.api.updateEquipment(d.current.id, v) : this.api.registerEquipment(establishmentId, v);
    } else {
      const v = this.person.getRawValue() as Partial<Personnel>;
      request = d.current ? this.api.updatePerson(d.current.id, v) : this.api.registerPerson(d.establishmentId, v);
    }
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (result) =>
        this.ref.close({ activated: result.activated.length, missingService: result.missingService } satisfies SubjectFormResult),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }
}
