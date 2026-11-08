import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import {
  InventoryCatalog,
  InventoryItem,
  InventoryMovementKind,
  InventoryOrder,
  InventoryOrderSuggestion,
  InventoryOverviewRow,
  InventoryServiceOptions,
  InventoryTask,
} from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { apiMessage } from '../evidence/record-evidence.dialog';
import { InventoryCountDialogComponent, InventoryCountData } from './inventory-count.dialog';
import { InventoryItemDialogComponent, InventoryItemData } from './inventory-item.dialog';
import { InventoryMovementDialogComponent, InventoryMovementData } from './inventory-movement.dialog';
import { InventoryOrderDialogComponent, InventoryOrderData } from './inventory-order.dialog';
import { InventorySupplierDialogComponent } from './inventory-supplier.dialog';
import { InventoryTaskDialogComponent, InventoryTaskData } from './inventory-task.dialog';
import { coverageLabel, lastCountLabel, needsAttention, sortByUrgency, statusIcon, statusLabel, stockLabel, taskScheduleLabel } from './inventory.helpers';

const ORDER_STATUS: Record<InventoryOrder['status'], string> = {
  draft: 'Borrador',
  approved: 'Aprobado, por recibir',
  received: 'Recibido',
  cancelled: 'Cancelado',
};

/** Qué se acaba, qué pedir y qué consume cada tarea. Sugiere y registra; el pedido lo envías tú. */
@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTabsModule],
  template: `
    <header class="head">
      <div>
        <h1>Inventario @if (context.current(); as e) { <span class="place">· {{ e.name }}</span> }</h1>
        <p class="sub">Revisa qué se está acabando y prepara el pedido a tiempo. El sistema descuenta lo que consume cada estudio realizado; el conteo físico lo corrige.</p>
      </div>
      @if (permissions.can('payments') && rows().length) {
        <button mat-flat-button color="primary" (click)="count()"><mat-icon>checklist</mat-icon> Hacer conteo físico</button>
      }
    </header>

    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

    @if (loaded()) {
      <mat-tab-group animationDuration="0ms">
        <mat-tab [label]="attention() ? 'Qué se acaba (' + attention() + ')' : 'Qué se acaba'">
          @if (rows().length === 0) {
            <section class="empty">
              <h2>¿Qué insumos usa tu gabinete?</h2>
              <p>Agrega placas, sobres e insumos de limpieza. Después dile a cada tarea qué consume y registra lo que tienes hoy.</p>
              @if (permissions.can('manage')) {
                <button mat-flat-button color="primary" (click)="editItem()">Agregar insumo</button>
              } @else {
                <p class="muted">Pide a quien administra el gabinete que agregue los insumos.</p>
              }
            </section>
          } @else {
            <ul class="list">
              @for (row of rows(); track row.id) {
                <li class="line stock">
                  <div class="name">
                    <span class="title">{{ row.name }}</span>
                    <span class="meta">{{ lastCount(row.lastCountedAt) }}@if (row.onOrder) { · {{ row.onOrder }} en camino }</span>
                  </div>
                  <div class="value"><span class="label">Hay</span>{{ stock(row) }}</div>
                  <div class="value"><span class="label">Alcanza para</span>{{ coverage(row.coverageDays) }}</div>
                  <div class="value"><span class="label">Pedir al llegar a</span>{{ row.reorderPoint ?? 'Sin definir' }}</div>
                  <span class="chip" [class]="'chip ' + row.status"><mat-icon aria-hidden="true">{{ icon(row.status) }}</mat-icon>{{ status(row.status) }}</span>
                  @if (permissions.can('payments')) {
                    <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'Acciones de ' + row.name"><mat-icon>more_vert</mat-icon></button>
                    <mat-menu #menu="matMenu">
                      <button mat-menu-item (click)="move(row, 'purchase')"><mat-icon>add_box</mat-icon> Registrar entrada</button>
                      <button mat-menu-item (click)="move(row, 'waste')"><mat-icon>report</mat-icon> Registrar merma</button>
                    </mat-menu>
                  }
                </li>
              }
            </ul>
          }
        </mat-tab>

        <mat-tab label="Pedidos">
          <p class="note">El sistema prepara la cantidad en empaques completos. Tú la revisas, la apruebas y la envías a tu proveedor.</p>
          @if (suggestions().length === 0 && orders().length === 0) {
            <section class="empty"><h2>Por ahora no hay nada que pedir</h2><p>Cuando un insumo llegue a su punto de reorden, aquí aparecerá la sugerencia.</p></section>
          }
          @for (group of suggestions(); track group.supplierId) {
            <section class="card">
              <div class="card-head">
                <h2>{{ group.supplierName ?? 'Sin proveedor asignado' }}</h2>
                @if (group.supplierId && permissions.can('payments')) {
                  <button mat-flat-button color="primary" (click)="prepareOrder(group)">Preparar pedido</button>
                }
              </div>
              <ul class="plain">
                @for (line of group.lines; track line.itemId) { <li>{{ line.name }}: {{ line.packs }} empaque(s), {{ line.quantity }} en total</li> }
              </ul>
              @if (!group.supplierId) { <p class="muted">Asigna un proveedor a estos insumos para preparar su pedido.</p> }
            </section>
          }
          @for (order of orders(); track order.id) {
            <section class="card">
              <div class="card-head">
                <h2>{{ supplierName(order.supplierId) }} <span class="count">{{ orderStatus(order) }}</span></h2>
                <div class="actions">
                  @if (order.status === 'draft' && permissions.can('manage')) { <button mat-flat-button color="primary" [disabled]="busy()" (click)="approve(order)">Aprobar pedido</button> }
                  @if (order.status === 'approved' && permissions.can('payments')) { <button mat-flat-button color="primary" [disabled]="busy()" (click)="receive(order)">Recibir pedido</button> }
                  @if ((order.status === 'draft' || order.status === 'approved') && permissions.can('manage')) { <button mat-stroked-button [disabled]="busy()" (click)="cancel(order)">Cancelar pedido</button> }
                </div>
              </div>
              <ul class="plain">
                @for (line of order.lines; track line.id) { <li>{{ itemName(line.itemId) }}: {{ line.packs }} empaque(s), {{ line.packs * line.packSize }} en total</li> }
              </ul>
            </section>
          }
        </mat-tab>

        <mat-tab label="Catálogo y tareas">
          @if (permissions.can('manage')) {
            <div class="toolbar">
              <button mat-stroked-button (click)="editItem()"><mat-icon>add</mat-icon> Agregar insumo</button>
              <button mat-stroked-button (click)="addSupplier()"><mat-icon>storefront</mat-icon> Agregar proveedor</button>
              <button mat-stroked-button [disabled]="!catalog()?.items?.length" (click)="editTask()"><mat-icon>playlist_add</mat-icon> Agregar tarea</button>
            </div>
          }
          <section class="card">
            <h2>Tareas <span class="count">{{ catalog()?.tasks?.length ?? 0 }}</span></h2>
            <ul class="plain">
              @for (task of catalog()?.tasks ?? []; track task.id) {
                <li class="row">
                  <span><strong>{{ task.name }}</strong> · {{ schedule(task) }} · {{ recipe(task) }}</span>
                  @if (permissions.can('manage')) {
                    <span class="actions">
                      <button mat-button (click)="editTask(task)">Editar</button>
                      <button mat-button [disabled]="busy()" (click)="removeTask(task)">Retirar</button>
                    </span>
                  }
                </li>
              } @empty { <li class="muted">Aún no hay tareas. Por ejemplo: Radiografía consume una placa y un sobre.</li> }
            </ul>
          </section>
          <section class="card">
            <h2>Insumos <span class="count">{{ catalog()?.items?.length ?? 0 }}</span></h2>
            <ul class="plain">
              @for (item of catalog()?.items ?? []; track item.id) {
                <li class="row">
                  <span><strong>{{ item.name }}</strong> · {{ item.baseUnit }} · empaque de {{ item.packSize }} · llega en {{ item.leadTimeDays }} día(s)</span>
                  @if (permissions.can('manage')) {
                    <span class="actions">
                      <button mat-button (click)="editItem(item)">Editar</button>
                      <button mat-button [disabled]="busy()" (click)="removeItem(item)">Dejar de seguir</button>
                    </span>
                  }
                </li>
              } @empty { <li class="muted">Aún no hay insumos.</li> }
            </ul>
          </section>
          <section class="card">
            <h2>Proveedores <span class="count">{{ catalog()?.suppliers?.length ?? 0 }}</span></h2>
            <ul class="plain">
              @for (supplier of catalog()?.suppliers ?? []; track supplier.id) {
                <li>{{ supplier.name }}@if (supplier.contact) { · {{ supplier.contact }} }</li>
              } @empty { <li class="muted">Aún no hay proveedores.</li> }
            </ul>
          </section>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 8px; }
    .head button { flex: none; }
    h1 { margin: 0; } .place { color: #475569; font-weight: 500; }
    .sub { margin: 4px 0 16px; color: #475569; font-size: 14px; max-width: 70ch; }
    h2 { display: flex; align-items: center; gap: 8px; font-size: 16px; color: #1e3a8a; margin: 0 0 8px; }
    .count { font-size: 12px; font-weight: 600; color: #475569; background: #e2e8f0; border-radius: 10px; padding: 0 8px; }
    .list { list-style: none; margin: 16px 0 0; padding: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
    .line { display: grid; align-items: center; gap: 12px; padding: 12px 16px; border-top: 1px solid #e2e8f0; }
    .line:first-child { border-top: 0; }
    .stock { grid-template-columns: minmax(160px, 1fr) 110px 130px 120px 160px 40px; }
    .name { display: flex; flex-direction: column; min-width: 0; }
    .title { font-weight: 700; font-size: 14px; color: #0f172a; }
    .meta, .label { font-size: 13px; color: #475569; }
    .label { display: block; font-size: 12px; }
    .value { font-size: 14px; color: #0f172a; font-variant-numeric: tabular-nums; }
    .chip { display: inline-flex; align-items: center; gap: 4px; justify-self: start; font-size: 12px; font-weight: 600; border-radius: 12px; padding: 2px 10px; white-space: nowrap; background: #e2e8f0; color: #334155; }
    .chip mat-icon { width: 16px; height: 16px; font-size: 16px; }
    .chip.out { background: #fee2e2; color: #991b1b; }
    .chip.reorder { background: #fef3c7; color: #92400e; }
    .chip.on_order { background: #dbeafe; color: #1e40af; }
    .chip.ok { background: #dcfce7; color: #166534; }
    .card, .empty { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; margin-top: 16px; }
    .card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .actions { display: flex; gap: 8px; flex: none; }
    .plain { list-style: none; margin: 8px 0 0; padding: 0; font-size: 14px; color: #0f172a; }
    .plain li { padding: 4px 0; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .note { margin: 16px 0 0; font-size: 14px; color: #475569; max-width: 70ch; }
    .empty p { max-width: 65ch; color: #475569; font-size: 14px; }
    .muted { color: #475569; font-size: 14px; }
    .error { color: #b91c1c; font-size: 14px; }
    @media (max-width: 1100px) {
      .stock { grid-template-columns: repeat(3, minmax(0, 1fr)) 40px; }
      .stock .name { grid-column: 1 / 4; grid-row: 1; }
      .stock > button { grid-column: 4; grid-row: 1; }
      .stock .chip { grid-column: 1 / -1; }
    }
    @media (max-width: 640px) {
      .head, .row { flex-direction: column; align-items: stretch; gap: 8px; }
      .stock { grid-template-columns: minmax(0, 1fr) 40px; }
      .stock .name { grid-column: 1; }
      .stock > button { grid-column: 2; }
      .stock .value { grid-column: 1 / -1; }
    }
  `],
})
export class InventoryComponent {
  readonly context = inject(EstablishmentContextService);
  readonly permissions = inject(PermissionsService);
  private readonly api = inject(FacilityApiService);
  private readonly dialog = inject(MatDialog);

  readonly rows = signal<InventoryOverviewRow[]>([]);
  readonly catalog = signal<InventoryCatalog | null>(null);
  readonly options = signal<InventoryServiceOptions>({ categories: [], studies: [] });
  readonly suggestions = signal<InventoryOrderSuggestion[]>([]);
  readonly orders = signal<InventoryOrder[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly attention = computed(() => needsAttention(this.rows()));

  readonly coverage = coverageLabel;
  readonly lastCount = lastCountLabel;
  readonly status = statusLabel;
  readonly icon = statusIcon;
  readonly stock = stockLabel;
  readonly schedule = taskScheduleLabel;

  constructor() {
    effect(() => {
      const e = this.context.current();
      if (e) this.load(e.id);
    });
  }

  private load(id: string): void {
    forkJoin({
      overview: this.api.inventoryOverview(id),
      catalog: this.api.inventoryCatalog(id),
      options: this.api.inventoryServiceOptions(id),
      suggestions: this.api.inventoryOrderSuggestions(id),
      orders: this.api.inventoryOrders(id),
    }).subscribe({
      next: ({ overview, catalog, options, suggestions, orders }) => {
        this.rows.set(sortByUrgency(overview.items));
        this.catalog.set(catalog);
        this.options.set(options);
        this.suggestions.set(suggestions);
        this.orders.set(orders);
        this.loaded.set(true);
        this.error.set(null);
      },
      error: (err: HttpErrorResponse) => this.error.set(`No pudimos cargar tu inventario. ${apiMessage(err)}`),
    });
  }

  private reload(): void {
    const id = this.context.current()?.id;
    if (id) this.load(id);
  }

  private get establishmentId(): string {
    return this.context.current()?.id ?? '';
  }

  itemName(id: string): string {
    return this.catalog()?.items.find((item) => item.id === id)?.name ?? 'Insumo retirado';
  }

  supplierName(id: string): string {
    return this.catalog()?.suppliers.find((supplier) => supplier.id === id)?.name ?? 'Proveedor';
  }

  orderStatus(order: InventoryOrder): string {
    return ORDER_STATUS[order.status];
  }

  recipe(task: InventoryTask): string {
    return task.lines.map((line) => `${line.quantity} ${this.itemName(line.itemId)}`).join(', ');
  }

  private openAndReload<T>(component: Parameters<MatDialog['open']>[0], data: T, width = '560px'): void {
    this.dialog.open(component, { width, data }).afterClosed().subscribe((saved) => saved && this.reload());
  }

  move(row: InventoryOverviewRow, kind: InventoryMovementKind): void {
    this.openAndReload<InventoryMovementData>(InventoryMovementDialogComponent, { establishmentId: this.establishmentId, row, kind }, '440px');
  }

  count(): void {
    this.openAndReload<InventoryCountData>(InventoryCountDialogComponent, { establishmentId: this.establishmentId, rows: this.rows() });
  }

  prepareOrder(suggestion: InventoryOrderSuggestion): void {
    this.openAndReload<InventoryOrderData>(InventoryOrderDialogComponent, { establishmentId: this.establishmentId, suggestion });
  }

  editItem(editing?: InventoryItem): void {
    this.openAndReload<InventoryItemData>(InventoryItemDialogComponent, { establishmentId: this.establishmentId, suppliers: this.catalog()?.suppliers ?? [], editing });
  }

  addSupplier(): void {
    this.openAndReload<{ establishmentId: string }>(InventorySupplierDialogComponent, { establishmentId: this.establishmentId }, '440px');
  }

  editTask(editing?: InventoryTask): void {
    this.openAndReload<InventoryTaskData>(InventoryTaskDialogComponent, { establishmentId: this.establishmentId, items: this.catalog()?.items ?? [], options: this.options(), editing }, '640px');
  }

  private act(action: ReturnType<FacilityApiService['approveInventoryOrder']>): void {
    this.busy.set(true);
    action.subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(apiMessage(err));
      },
    });
  }

  approve(order: InventoryOrder): void {
    this.act(this.api.approveInventoryOrder(order.id));
  }

  receive(order: InventoryOrder): void {
    this.act(this.api.receiveInventoryOrder(order.id));
  }

  cancel(order: InventoryOrder): void {
    this.act(this.api.cancelInventoryOrder(order.id));
  }

  removeTask(task: InventoryTask): void {
    this.act(this.api.deleteInventoryTask(task.id));
  }

  removeItem(item: InventoryItem): void {
    this.act(this.api.deleteInventoryItem(item.id));
  }
}
