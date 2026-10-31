import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Establishment } from '../../core/models/facility.models';
import { ESTABLISHMENT_TYPE_LABELS, SERVICE_LABELS } from '../../core/models/labels';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { EstablishmentFormDialogComponent } from './establishment-form.dialog';

@Component({
  selector: 'app-establishments',
  standalone: true,
  imports: [MatCardModule, MatButtonModule],
  template: `
    <div class="head">
      <h1>Establecimientos</h1>
      <button mat-flat-button color="primary" (click)="create()">Nuevo establecimiento</button>
    </div>
    @if (context.establishments().length === 0) {
      <mat-card class="empty">
        <h2>Da de alta tu primer establecimiento</h2>
        <p>Con su tipo y sus servicios (rayos X, mastografía, ultrasonido…) el sistema activa las obligaciones que le aplican: licencia, responsable, RPBI, protección civil y más.</p>
        <button mat-flat-button color="primary" (click)="create()">Empezar</button>
      </mat-card>
    }
    <div class="grid">
      @for (e of context.establishments(); track e.id) {
        <mat-card class="card" [class.current]="e.id === context.current()?.id">
          <h2>{{ e.name }}</h2>
          <p>{{ typeLabel(e) }} · {{ servicesLabel(e) }}</p>
          @if (e.sanitaryResponsibleName) { <p class="muted">Responsable sanitario: {{ e.sanitaryResponsibleName }}</p> }
          @if (e.clues) { <p class="muted">CLUES {{ e.clues }}</p> }
          <div class="actions">
            <button mat-button (click)="open(e)">Ver «Hoy»</button>
            <button mat-button (click)="edit(e)">Editar</button>
          </div>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    h1 { margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .card { padding: 16px; } .card.current { outline: 2px solid #2563c9; }
    .card h2 { margin: 0 0 6px; font-size: 17px; }
    .card p { margin: 2px 0; font-size: 13px; } .muted { color: #64748b; }
    .actions { margin-top: 10px; display: flex; gap: 6px; }
    .empty { padding: 24px; margin-bottom: 16px; }
  `],
})
export class EstablishmentsComponent {
  readonly context = inject(EstablishmentContextService);
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  typeLabel(e: Establishment): string {
    return ESTABLISHMENT_TYPE_LABELS[e.type] ?? e.type;
  }

  servicesLabel(e: Establishment): string {
    return e.services.map((s) => SERVICE_LABELS[s] ?? s).join(', ') || 'Sin servicios';
  }

  create(): void {
    this.dialog.open(EstablishmentFormDialogComponent, { width: '720px', data: null }).afterClosed().subscribe((e?: Establishment) => {
      if (!e) return;
      this.refresh(e.id);
      this.router.navigate(['/operacion/hoy']);
    });
  }

  edit(e: Establishment): void {
    this.dialog.open(EstablishmentFormDialogComponent, { width: '720px', data: e }).afterClosed().subscribe((saved?: Establishment) => saved && this.refresh(saved.id));
  }

  open(e: Establishment): void {
    this.context.select(e.id);
    this.router.navigate(['/operacion/hoy']);
  }

  private refresh(selectId: string): void {
    this.api.establishments().subscribe((list) => {
      this.context.setEstablishments(list);
      this.context.select(selectId);
    });
  }
}
