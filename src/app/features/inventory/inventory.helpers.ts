import { InventoryItemInput, InventoryOverviewRow, InventoryStockStatus, InventoryTask, InventoryTaskInput } from '../../core/models/facility.models';

const DATE = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

const URGENCY: Record<InventoryStockStatus, number> = { out: 0, reorder: 1, on_order: 2, ok: 3, no_data: 4 };

const STATUS_LABELS: Record<InventoryStockStatus, string> = {
  out: 'Agotado',
  reorder: 'Hay que pedir',
  on_order: 'En camino',
  ok: 'Suficiente',
  no_data: 'Sin datos',
};

const STATUS_ICONS: Record<InventoryStockStatus, string> = {
  out: 'block',
  reorder: 'shopping_cart',
  on_order: 'local_shipping',
  ok: 'check_circle',
  no_data: 'help_outline',
};

/** Lo más urgente arriba; a igual estado, lo que dura menos. */
export function sortByUrgency(rows: readonly InventoryOverviewRow[]): InventoryOverviewRow[] {
  return [...rows].sort(
    (a, b) => URGENCY[a.status] - URGENCY[b.status] || (a.coverageDays ?? Infinity) - (b.coverageDays ?? Infinity) || a.name.localeCompare(b.name, 'es'),
  );
}

export function needsAttention(rows: readonly InventoryOverviewRow[]): number {
  return rows.filter((row) => row.status === 'out' || row.status === 'reorder').length;
}

export function statusLabel(status: InventoryStockStatus): string {
  return STATUS_LABELS[status];
}

export function statusIcon(status: InventoryStockStatus): string {
  return STATUS_ICONS[status];
}

/** Sin consumo medido no es cero: es que todavía no hay dato. */
export function coverageLabel(days: number | null): string {
  if (days === null) return 'Sin consumo medido';
  if (days === 0) return 'Menos de 1 día';
  return days === 1 ? '1 día' : `${days} días`;
}

export function stockLabel(row: Pick<InventoryOverviewRow, 'status' | 'onHand' | 'baseUnit'>): string {
  if (row.status === 'no_data' && row.onHand === 0) return 'Sin registrar';
  return `${row.onHand} ${row.baseUnit}`;
}

export function lastCountLabel(value: string | null): string {
  return value ? `Contado el ${DATE.format(new Date(value)).replaceAll('.', '')}` : 'Sin conteo físico';
}

export function taskScheduleLabel(task: Pick<InventoryTask, 'kind' | 'periodDays'>): string {
  if (task.kind === 'service') return 'Al realizarse el estudio';
  return task.periodDays === 1 ? 'Cada día' : `Cada ${task.periodDays} días`;
}

/** Al editar, un vacío significa «quitar el valor»; al crear, no hay nada que quitar. */
export function toItemInput(raw: Record<string, unknown>, editing: boolean): InventoryItemInput {
  const entries = Object.entries(raw).filter(([, value]) => editing || value !== null);
  return Object.fromEntries(entries) as unknown as InventoryItemInput;
}

export function toTaskInput(raw: {
  name: string | null;
  kind: InventoryTask['kind'] | null;
  target: string | null;
  periodDays: number | null;
  lines: { itemId: string | null; quantity: number | null }[];
}): InventoryTaskInput {
  const kind = raw.kind ?? 'service';
  const [targetType, targetId] = (raw.target ?? ':').split(':');
  const destination =
    kind === 'recurring'
      ? { periodDays: raw.periodDays ?? 1 }
      : targetType === 'category'
        ? { categoryId: targetId }
        : { catalogStudyId: targetId };
  return {
    name: raw.name ?? '',
    kind,
    ...destination,
    lines: raw.lines.map((line) => ({ itemId: line.itemId ?? '', quantity: line.quantity ?? 1 })),
  };
}
