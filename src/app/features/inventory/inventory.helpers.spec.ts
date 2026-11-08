import { InventoryOverviewRow, InventoryTask } from '../../core/models/facility.models';
import { coverageLabel, lastCountLabel, needsAttention, sortByUrgency, statusLabel, stockLabel, taskScheduleLabel, toItemInput, toTaskInput } from './inventory.helpers';

const row = (over: Partial<InventoryOverviewRow>): InventoryOverviewRow => ({
  id: 'i',
  name: 'Placa',
  category: 'clinical',
  baseUnit: 'pieza',
  supplierId: null,
  packSize: 1,
  minQuantity: null,
  maxQuantity: null,
  onHand: 10,
  onOrder: 0,
  lastCountedAt: null,
  status: 'ok',
  dailyDemand: 1,
  coverageDays: 10,
  reorderPoint: 5,
  suggestedPacks: 0,
  suggestedQuantity: 0,
  ...over,
});

describe('inventory.helpers', () => {
  describe('sortByUrgency', () => {
    it('pone primero lo agotado y luego lo que hay que pedir', () => {
      const sorted = sortByUrgency([
        row({ id: 'ok', status: 'ok' }),
        row({ id: 'nodata', status: 'no_data' }),
        row({ id: 'order', status: 'on_order' }),
        row({ id: 'reorder', status: 'reorder' }),
        row({ id: 'out', status: 'out' }),
      ]);
      expect(sorted.map((r) => r.id)).toEqual(['out', 'reorder', 'order', 'ok', 'nodata']);
    });

    it('con el mismo estado, va primero lo que dura menos', () => {
      const sorted = sortByUrgency([
        row({ id: 'largo', status: 'reorder', coverageDays: 9 }),
        row({ id: 'corto', status: 'reorder', coverageDays: 2 }),
        row({ id: 'sin', status: 'reorder', coverageDays: null }),
      ]);
      expect(sorted.map((r) => r.id)).toEqual(['corto', 'largo', 'sin']);
    });

    it('no altera la lista original', () => {
      const original = [row({ id: 'ok' }), row({ id: 'out', status: 'out' })];
      sortByUrgency(original);
      expect(original[0].id).toBe('ok');
    });
  });

  describe('needsAttention', () => {
    it('solo cuenta lo agotado y lo que hay que pedir', () => {
      expect(needsAttention([row({ status: 'out' }), row({ status: 'reorder' }), row({ status: 'on_order' }), row({ status: 'ok' })])).toBe(2);
    });
  });

  describe('toItemInput', () => {
    const raw = { name: 'Placa', minQuantity: null, maxQuantity: 8, supplierId: null };

    it('al crear no manda los opcionales vacíos', () => {
      expect(toItemInput(raw, false)).toEqual({ name: 'Placa', maxQuantity: 8 } as never);
    });

    it('al editar manda los vacíos para poder quitarlos', () => {
      expect(toItemInput(raw, true)).toEqual(raw as never);
    });
  });

  describe('toTaskInput', () => {
    const base = { name: 'Radiografía', periodDays: null, lines: [{ itemId: 'a', quantity: 2 }] };

    it('una tarea por categoría manda solo la categoría', () => {
      expect(toTaskInput({ ...base, kind: 'service', target: 'category:c1' })).toEqual({
        name: 'Radiografía', kind: 'service', categoryId: 'c1', lines: base.lines,
      });
    });

    it('una tarea por estudio manda solo el estudio', () => {
      expect(toTaskInput({ ...base, kind: 'service', target: 'study:s1' })).toEqual({
        name: 'Radiografía', kind: 'service', catalogStudyId: 's1', lines: base.lines,
      });
    });

    it('una tarea recurrente manda su periodo y no un destino', () => {
      expect(toTaskInput({ ...base, kind: 'recurring', target: 'category:c1', periodDays: 3 })).toEqual({
        name: 'Radiografía', kind: 'recurring', periodDays: 3, lines: base.lines,
      });
    });
  });

  describe('etiquetas', () => {
    it('nombra cada estado con texto', () => {
      expect(statusLabel('out')).toBe('Agotado');
      expect(statusLabel('reorder')).toBe('Hay que pedir');
      expect(statusLabel('on_order')).toBe('En camino');
      expect(statusLabel('ok')).toBe('Suficiente');
      expect(statusLabel('no_data')).toBe('Sin datos');
    });

    it('la cobertura sin consumo conocido no se muestra como cero', () => {
      expect(coverageLabel(null)).toBe('Sin consumo medido');
      expect(coverageLabel(0)).toBe('Menos de 1 día');
      expect(coverageLabel(1)).toBe('1 día');
      expect(coverageLabel(12)).toBe('12 días');
    });

    it('un insumo sin movimientos dice que falta el dato', () => {
      expect(stockLabel(row({ status: 'no_data', onHand: 0, dailyDemand: 0 }))).toBe('Sin registrar');
      expect(stockLabel(row({ onHand: 25 }))).toBe('25 pieza');
    });

    it('avisa cuando nunca se ha contado', () => {
      expect(lastCountLabel(null)).toBe('Sin conteo físico');
      expect(lastCountLabel('2026-11-03T15:00:00Z')).toContain('2026');
    });

    it('describe cada cuánto se repite una tarea', () => {
      const task = { kind: 'recurring', periodDays: 1 } as InventoryTask;
      expect(taskScheduleLabel(task)).toBe('Cada día');
      expect(taskScheduleLabel({ ...task, periodDays: 7 })).toBe('Cada 7 días');
      expect(taskScheduleLabel({ ...task, kind: 'service', periodDays: null })).toBe('Al realizarse el estudio');
    });
  });
});
