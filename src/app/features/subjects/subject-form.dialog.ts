import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable } from 'rxjs';
import { Equipment, EquipmentModality, EquipmentOperationalStatus, EquipmentType, Personnel, ServiceType, StaffRole, SubjectResult } from '../../core/models/facility.models';
import { MODALITY_LABELS, OPERATIONAL_STATUS_LABELS, ROLE_LABELS } from '../../core/models/labels';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { EstablishmentFieldComponent } from '../../shared/components/establishment-field.component';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { LinkOption, linkOptions, prefillFromUser } from './link-user.helpers';
import { CatalogGroup, catalogGroups, warrantyBeforeInstall } from './equipment-catalog.helpers';

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
          @if (!catalogFailed()) {
            <mat-form-field appearance="outline" class="wide">
              <mat-label>Tipo de equipo</mat-label>
              <mat-select formControlName="equipmentTypeKey">
                <mat-option [value]="null">Sin tipo (elegir modalidad)</mat-option>
                @for (g of typeGroups(); track g.label) {
                  <mat-optgroup [label]="g.label">
                    @for (t of g.types; track t.key) { <mat-option [value]="t.key">{{ t.name }}</mat-option> }
                  </mat-optgroup>
                }
              </mat-select>
              <mat-hint>El tipo fija la modalidad y los mantenimientos que se le sugieren.</mat-hint>
            </mat-form-field>
          } @else {
            <p class="hint wide" role="status">No pudimos cargar los tipos de equipo. Puedes registrarlo con su modalidad y elegir el tipo después.</p>
          }
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
          <mat-form-field appearance="outline">
            <mat-label>Estado</mat-label>
            <mat-select formControlName="operationalStatus">
              @for (s of operationalStatuses; track s[0]) { <mat-option [value]="s[0]">{{ s[1] }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Registro sanitario (COFEPRIS)</mat-label><input matInput formControlName="sanitaryRegistration" /></mat-form-field>
          <mat-form-field appearance="outline" class="wide"><mat-label>Proveedor de servicio</mat-label><input matInput formControlName="serviceProvider" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Instalado el</mat-label><input matInput type="date" formControlName="installedOn" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Garantía hasta</mat-label><input matInput type="date" formControlName="warrantyUntil" /></mat-form-field>
          @if (equipment.hasError('warrantyBeforeInstall')) {
            <p class="error wide" role="alert">La garantía no puede terminar antes de la instalación. Revisa las dos fechas.</p>
          }
        </form>
        <p class="hint">Al registrarlo se activan los avisos de mantenimiento que le tocan según su tipo o su modalidad.</p>
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
  readonly operationalStatuses = Object.entries(OPERATIONAL_STATUS_LABELS);
  readonly types = signal<EquipmentType[]>([]);
  readonly typeGroups = computed<CatalogGroup[]>(() => catalogGroups(this.types()));
  readonly catalogFailed = signal(false);
  readonly roles = Object.entries(ROLE_LABELS);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly userOptions = signal<LinkOption[]>([]);
  readonly usersFailed = signal(false);

  private readonly eq = this.data.kind === 'equipment' ? this.data.current : undefined;
  private readonly pe = this.data.kind === 'person' ? this.data.current : undefined;

  readonly equipment = this.fb.group(
    {
      name: [this.eq?.name ?? '', Validators.required],
      equipmentTypeKey: this.fb.control<string | null>(this.eq?.equipmentTypeKey ?? null),
      modality: this.fb.control<EquipmentModality>(this.eq?.modality ?? 'xray', Validators.required),
      serialNumber: [this.eq?.serialNumber ?? ''],
      manufacturer: [this.eq?.manufacturer ?? ''],
      model: [this.eq?.model ?? ''],
      room: [this.eq?.room ?? ''],
      operationalStatus: this.fb.control<EquipmentOperationalStatus>(this.eq?.operationalStatus ?? 'operating'),
      sanitaryRegistration: [this.eq?.sanitaryRegistration ?? ''],
      serviceProvider: [this.eq?.serviceProvider ?? ''],
      installedOn: [this.eq?.installedOn ?? ''],
      warrantyUntil: [this.eq?.warrantyUntil ?? ''],
      establishmentId: [this.eq?.establishmentId ?? this.data.establishmentId],
    },
    { validators: warrantyAfterInstall },
  );

  readonly person = this.fb.group({
    fullName: [this.pe?.fullName ?? '', Validators.required],
    role: [this.pe?.role ?? 'tecnico-radiologo', Validators.required],
    professionalLicense: [this.pe?.professionalLicense ?? '', Validators.pattern(/^\d{7,8}$/)],
    occupationallyExposed: [this.pe?.occupationallyExposed ?? false],
    userId: this.fb.control<string | null>(this.pe?.userId ?? null),
  });

  constructor() {
    if (this.data.kind === 'person') this.loadLinkableUsers(this.data.establishmentId);
    if (this.data.kind === 'equipment') this.loadCatalog();
  }

  private loadCatalog(): void {
    const typeKey = this.equipment.controls.equipmentTypeKey;
    typeKey.valueChanges.subscribe((key) => this.applyType(key));
    if (typeKey.value) this.equipment.controls.modality.disable();
    this.api.equipmentCatalog().subscribe({
      next: (catalog) => {
        this.types.set(catalog.types);
        this.applyType(typeKey.value);
      },
      error: () => this.catalogFailed.set(true),
    });
  }

  /** Con tipo, la modalidad es la del tipo y no se edita (el backend rechaza las que no coinciden). */
  private applyType(key: string | null): void {
    const modality = this.equipment.controls.modality;
    if (!key) {
      modality.enable({ emitEvent: false });
      return;
    }
    const type = this.types().find((t) => t.key === key);
    if (type) modality.setValue(type.modality, { emitEvent: false });
    modality.disable({ emitEvent: false });
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
    if (this.invalid()) return;
    const d = this.data;
    let request: Observable<SubjectResult<unknown>>;
    if (d.kind === 'equipment') {
      const { establishmentId, modality, ...rest } = this.equipment.getRawValue();
      const v: Partial<Equipment> = rest.equipmentTypeKey ? rest : { ...rest, modality };
      request = d.current ? this.api.updateEquipment(d.current.id, emptyAsNull(v)) : this.api.registerEquipment(establishmentId, v);
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

/** La garantía no termina antes de la instalación (fechas AAAA-MM-DD). */
function warrantyAfterInstall(group: AbstractControl): ValidationErrors | null {
  const { installedOn, warrantyUntil } = group.value as { installedOn?: string; warrantyUntil?: string };
  return warrantyBeforeInstall(installedOn, warrantyUntil) ? { warrantyBeforeInstall: true } : null;
}

/** Al editar, la ficha vacía se manda como `null` para que el backend borre el dato. */
function emptyAsNull(input: Partial<Equipment>): Partial<Equipment> {
  const profile = ['sanitaryRegistration', 'serviceProvider', 'installedOn', 'warrantyUntil'] as const;
  const out: Partial<Equipment> = { ...input };
  for (const key of profile) if (out[key] === '') out[key] = null;
  return out;
}
