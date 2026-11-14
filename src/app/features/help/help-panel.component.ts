import { Component, computed, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { PermissionsService } from '../../core/services/permissions.service';
import { SetupConversationComponent } from './setup-conversation.component';
import { SupportReportsComponent } from './support-reports.component';

export interface HelpTab {
  key: 'setup' | 'reports';
  label: string;
}

/**
 * Pestañas del panel. «Configurar» solo con `facility.manage`: es el permiso
 * de todos sus pasos, y jc-core igual los marcaría como no disponibles.
 */
export function helpTabs(canManage: boolean): HelpTab[] {
  const reports: HelpTab = { key: 'reports', label: 'Mis reportes' };
  return canManage ? [{ key: 'setup', label: 'Configurar' }, reports] : [reports];
}

/** Panel lateral de Ayuda: configuración guiada y reportes de soporte de Gabinete. */
@Component({
  selector: 'app-help-panel',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTabsModule, SetupConversationComponent, SupportReportsComponent],
  template: `
    <header>
      <h2>Ayuda</h2>
      <button mat-icon-button type="button" (click)="closed.emit()" aria-label="Cerrar ayuda"><mat-icon>close</mat-icon></button>
    </header>
    <mat-tab-group class="tabs" [selectedIndex]="selected()" (selectedIndexChange)="selected.set($event)" mat-stretch-tabs="true">
      @for (tab of tabs(); track tab.key) {
        <mat-tab [label]="tab.label">
          <ng-template matTabContent>
            @if (tab.key === 'setup') {
              <app-setup-conversation />
            } @else {
              <app-support-reports />
            }
          </ng-template>
        </mat-tab>
      }
    </mat-tab-group>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 0 16px; }
    h2 { margin: 0; font-size: 18px; }
    .tabs { flex: 1; min-height: 0; }
    .tabs ::ng-deep .mat-mdc-tab-body-wrapper { flex: 1; min-height: 0; }
    .tabs ::ng-deep .mat-mdc-tab-body-content { display: flex; flex-direction: column; }
  `],
})
export class HelpPanelComponent {
  private readonly permissions = inject(PermissionsService);
  readonly closed = output<void>();
  readonly tabs = computed(() => helpTabs(this.permissions.can('manage')));
  readonly selected = signal(0);
}
