import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ExportFormat } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';

const FORBIDDEN = 403;
const SNACK_DURATION_MS = 6000;
const EXTENSIONS: Record<ExportFormat, string> = { xlsx: 'xlsx', csv: 'zip' };

/** «operacion-listados-2026-11-02.xlsx», con la fecha local de quien descarga. */
export function exportFileName(format: ExportFormat, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `operacion-listados-${day}.${EXTENSIONS[format]}`;
}

export function exportErrorMessage(error: unknown): string {
  return error instanceof HttpErrorResponse && error.status === FORBIDDEN
    ? 'No tienes permiso para descargar los listados. Pídeselo a quien administra tu cuenta.'
    : 'No pudimos preparar la descarga. Inténtalo de nuevo en unos minutos.';
}

/** Descargar obligaciones, equipos, personal e historial del establecimiento elegido. */
@Component({
  selector: 'app-export-lists-button',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <button mat-stroked-button [matMenuTriggerFor]="formats" [disabled]="!context.current() || downloading()">
      <mat-icon>download</mat-icon>
      {{ downloading() ? 'Preparando…' : 'Descargar listados' }}
    </button>
    <mat-menu #formats="matMenu">
      <button mat-menu-item (click)="download('xlsx')">Excel (.xlsx)</button>
      <button mat-menu-item (click)="download('csv')">CSV (un archivo por listado, en .zip)</button>
    </mat-menu>
  `,
})
export class ExportListsButtonComponent {
  private readonly api = inject(FacilityApiService);
  private readonly snack = inject(MatSnackBar);
  readonly context = inject(EstablishmentContextService);
  readonly downloading = signal<ExportFormat | null>(null);

  download(format: ExportFormat): void {
    const establishment = this.context.current();
    if (!establishment) return;
    this.downloading.set(format);
    this.api.exportLists(establishment.id, format).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        this.save(blob, exportFileName(format));
      },
      error: (error) => {
        this.downloading.set(null);
        this.snack.open(exportErrorMessage(error), 'OK', { duration: SNACK_DURATION_MS });
      },
    });
  }

  private save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
