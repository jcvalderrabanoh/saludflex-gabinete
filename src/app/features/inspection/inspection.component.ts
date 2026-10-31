import { Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ChainVerification, EstablishmentStatus } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';

/** «Si llega COFEPRIS hoy, entregas esto.» */
@Component({
  selector: 'app-inspection',
  standalone: true,
  imports: [MatCardModule, MatButtonModule],
  template: `
    <h1>Carpeta de inspección</h1>
    <p class="sub">Si llega una verificación hoy, esta es la carpeta que entregas: tu establecimiento, cada obligación con su evidencia vigente y en el orden en que la piden.</p>
    @if (status(); as s) {
      <mat-card class="card">
        <div class="pct">{{ s.score.percent }} %</div>
        <div>listo para inspección · {{ s.score.overdue }} vencidas · {{ s.score.missing }} faltan</div>
        @if (s.score.overdue + s.score.missing > 0) {
          <p class="warn">La carpeta sale igual, pero marca lo vencido y lo faltante. Revisa «Hoy» antes de imprimirla.</p>
        }
        <button mat-flat-button color="primary" (click)="download()" [disabled]="downloading()">
          {{ downloading() ? 'Generando…' : 'Descargar carpeta (PDF)' }}
        </button>
      </mat-card>
    }
    @if (chain(); as c) {
      <mat-card class="card">
        <h2>Integridad de la evidencia</h2>
        @if (c.valid) {
          <p class="ok">Cadena íntegra: {{ c.length }} registros encadenados. Ninguno se ha modificado ni borrado.</p>
          <p class="hash">Cabeza de la cadena: {{ c.headHash }}</p>
        } @else {
          <p class="bad">La cadena no verifica en el eslabón {{ c.brokenAtSeq }} ({{ c.reason }}). Contacta a soporte.</p>
        }
      </mat-card>
    }
    <p class="note">Este documento organiza la evidencia del establecimiento; no constituye certificación ni asesoría legal.</p>
  `,
  styles: [`
    h1 { margin: 0; } .sub { color: #64748b; max-width: 720px; }
    .card { padding: 18px 20px; margin-top: 14px; max-width: 720px; }
    .pct { font-size: 32px; font-weight: 700; color: #2563c9; }
    .warn { color: #92400e; font-size: 13px; } .ok { color: #166534; } .bad { color: #b91c1c; }
    .hash { font-family: monospace; font-size: 11px; color: #64748b; word-break: break-all; }
    h2 { font-size: 15px; margin: 0 0 6px; }
    .note { font-size: 12px; color: #94a3b8; margin-top: 18px; }
  `],
})
export class InspectionComponent {
  private readonly api = inject(FacilityApiService);
  private readonly context = inject(EstablishmentContextService);
  readonly status = signal<EstablishmentStatus | null>(null);
  readonly chain = signal<ChainVerification | null>(null);
  readonly downloading = signal(false);

  constructor() {
    effect(() => {
      const e = this.context.current();
      if (e) this.api.status(e.id).subscribe((s) => this.status.set(s));
    });
    this.api.verifyChain().subscribe({ next: (c) => this.chain.set(c), error: () => undefined });
  }

  download(): void {
    const e = this.context.current();
    if (!e) return;
    this.downloading.set(true);
    this.api.inspectionFolder(e.id).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `carpeta-inspeccion-${this.status()?.today ?? ''}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.downloading.set(false),
    });
  }
}
