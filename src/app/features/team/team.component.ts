import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import { TeamMember, TeamPreset } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { InviteMemberDialogComponent } from './invite-member.dialog';
import { PRESETS, STATUS_LABELS, canOperate, presetLabel, presetOf } from './team.helpers';

/** Equipo del gabinete: invitar, reenviar, cambiar lo que puede hacer y dar de baja. */
@Component({
  selector: 'app-team',
  standalone: true,
  imports: [MatButtonModule, MatFormFieldModule, MatSelectModule, MatSnackBarModule],
  template: `
    <div class="head">
      <div>
        <h1>Equipo</h1>
        <p class="sub">Invita a quien registra la evidencia. A cada obligación le asignas su responsable en «Obligaciones».</p>
        <p class="unlimited">Usuarios ilimitados: el precio es por establecimiento.</p>
      </div>
      <button mat-flat-button color="primary" (click)="invite()">Invitar persona</button>
    </div>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    <section class="list">
      @for (m of members(); track m.id) {
        <article class="member" [class.inactive]="m.status === 'inactive'">
          <div class="text">
            <div class="name">{{ m.name }}</div>
            <div class="meta">{{ m.email }}</div>
            <div class="meta"><span class="chip" [class]="'chip ' + m.status">{{ status(m) }}</span> · {{ m.isManager ? 'Administra el gabinete' : preset(m) }}</div>
          </div>
          @if (operable(m) && m.status !== 'inactive') {
            <div class="actions">
              <mat-form-field appearance="outline" class="preset" subscriptSizing="dynamic">
                <mat-label>Puede</mat-label>
                <mat-select [value]="presetValue(m)" (selectionChange)="changePreset(m, $event.value)" [attr.aria-label]="'Qué puede hacer ' + m.name">
                  @for (p of presets; track p.value) { <mat-option [value]="p.value">{{ p.label }}</mat-option> }
                </mat-select>
              </mat-form-field>
              @if (m.status === 'invited') { <button mat-button (click)="resend(m)">Reenviar invitación</button> }
              <button mat-button color="warn" (click)="remove(m)">Dar de baja</button>
            </div>
          }
        </article>
      } @empty {
        <p class="empty">Todavía no hay nadie más en el equipo. Usa «Invitar persona» para empezar.</p>
      }
    </section>
    <section class="legend">
      @for (p of presets; track p.value) { <p><strong>{{ p.label }}:</strong> {{ p.explanation }}</p> }
    </section>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    h1 { margin: 0; } .sub { color: #6b7684; margin: 4px 0; max-width: 720px; }
    .unlimited { margin: 0 0 16px; font-weight: 600; color: #08764e; }
    .list { max-width: 900px; }
    .member { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border: 1px solid #d9dee5; border-radius: 16px; background: #fff; margin-bottom: 8px; }
    .member.inactive { opacity: .7; }
    .text { flex: 1; min-width: 200px; } .name { font-weight: 600; } .meta { font-size: 14px; color: #6b7684; }
    .chip { border-radius: 8px; padding: 1px 8px; font-weight: 600; font-size: 12px; }
    .chip.active { background: #e7f6ef; color: #08764e; } .chip.invited { background: #fff3d6; color: #805800; } .chip.inactive { background: #f4f5f7; color: #3c4757; }
    .actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .preset { width: 170px; }
    .legend { max-width: 900px; margin-top: 16px; font-size: 14px; color: #3c4757; }
    .legend p { margin: 2px 0; }
    .empty { color: #6b7684; } .error { color: #b4232c; }
    @media (max-width: 767.98px) { .actions { width: 100%; } .preset { flex: 1; } }
  `],
})
export class TeamComponent implements OnInit {
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly permissions = inject(PermissionsService);
  readonly presets = PRESETS;
  readonly members = signal<TeamMember[]>([]);
  readonly error = signal<string | null>(null);
  readonly status = (m: TeamMember) => STATUS_LABELS[m.status] ?? m.status;
  readonly preset = (m: TeamMember) => presetLabel(m.permissions);
  readonly presetValue = (m: TeamMember) => presetOf(m.permissions);
  readonly operable = (m: TeamMember) => canOperate(m, this.permissions.userId());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.team().subscribe({
      next: (list) => this.members.set(list),
      error: (err: HttpErrorResponse) => this.error.set(`No pudimos cargar el equipo: ${apiMessage(err)}`),
    });
  }

  invite(): void {
    this.dialog
      .open(InviteMemberDialogComponent, { width: '520px', maxWidth: '100vw' })
      .afterClosed()
      .subscribe((sent) => {
        if (!sent) return;
        this.snack.open('Invitación enviada. Le llegará un correo para crear su contraseña.', 'OK', { duration: 5000 });
        this.load();
      });
  }

  resend(member: TeamMember): void {
    this.run(this.api.resendInvitation(member.id), `Reenviamos la invitación a ${member.email}.`);
  }

  changePreset(member: TeamMember, preset: TeamPreset): void {
    this.run(this.api.changePreset(member.id, preset), `Listo: ${member.name} ahora es ${PRESETS.find((p) => p.value === preset)?.label.toLowerCase()}.`);
  }

  remove(member: TeamMember): void {
    const question = `¿Dar de baja a ${member.name} del gabinete? Pierde el acceso y se quita como responsable de sus obligaciones. Su evidencia se conserva.`;
    if (!confirm(question)) return;
    this.run(this.api.removeTeamMember(member.id), `${member.name} ya no tiene acceso al gabinete.`);
  }

  /** Ejecuta la acción, avisa el resultado y recarga (si falla, también recarga para no mostrar un estado falso). */
  private run(action: Observable<unknown>, done: string): void {
    this.error.set(null);
    action.subscribe({
      next: () => {
        this.snack.open(done, 'OK', { duration: 5000 });
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiMessage(err));
        this.load();
      },
    });
  }
}
