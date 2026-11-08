import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { InventoryOverviewRow } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { InventoryComponent } from './inventory.component';

const row = (over: Partial<InventoryOverviewRow>): InventoryOverviewRow => ({
  id: 'i', name: 'Placa', category: 'clinical', baseUnit: 'pieza', supplierId: null, packSize: 1, minQuantity: null, maxQuantity: null,
  onHand: 10, onOrder: 0, lastCountedAt: null, status: 'ok', dailyDemand: 1, coverageDays: 10, reorderPoint: 5, suggestedPacks: 0, suggestedQuantity: 0, ...over,
});

describe('InventoryComponent', () => {
  function render(items: InventoryOverviewRow[], allowed: boolean, overview = of({ items })) {
    TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideNoopAnimations(),
        { provide: EstablishmentContextService, useValue: { current: signal({ id: 'e', name: 'Matriz' }) } },
        { provide: PermissionsService, useValue: { can: () => allowed } },
        {
          provide: FacilityApiService,
          useValue: {
            inventoryOverview: () => overview,
            inventoryCatalog: () => of({ suppliers: [], items: [], tasks: [] }),
            inventoryServiceOptions: () => of({ categories: [], studies: [] }),
            inventoryOrderSuggestions: () => of([]),
            inventoryOrders: () => of([]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(InventoryComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra primero lo agotado, con su estado en texto', () => {
    const page = render([row({ id: 'a', name: 'Sobre' }), row({ id: 'b', name: 'Placa', status: 'out', onHand: 0, coverageDays: 0 })], true);

    const titles = [...page.querySelectorAll('.title')].map((e) => e.textContent);
    expect(titles).toEqual(['Placa', 'Sobre']);
    expect(page.querySelector('.line .chip')?.textContent).toContain('Agotado');
    expect(page.textContent).toContain('Qué se acaba (1)');
  });

  it('sin insumos invita a agregar el primero', () => {
    const page = render([], true);

    expect(page.textContent).toContain('¿Qué insumos usa tu gabinete?');
    expect(page.textContent).toContain('Agregar insumo');
  });

  it('quien solo consulta no ve acciones de captura', () => {
    const page = render([row({})], false);

    expect(page.textContent).not.toContain('Hacer conteo físico');
    expect(page.querySelector('.line button')).toBeNull();
  });

  it('un error de carga dice qué pasó', () => {
    const page = render([], true, throwError(() => new HttpErrorResponse({ status: 0 })));

    expect(page.querySelector('.error')?.textContent).toContain('No pudimos cargar tu inventario');
  });
});
