import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { Equipment, EquipmentCatalog, EquipmentType, Establishment } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { EquipmentDetailDialogComponent } from './equipment-detail.dialog';
import { SubjectsComponent } from './subjects.component';

const US: EquipmentType = { key: 'ultrasonido', name: 'Ultrasonido', category: 'imaging', modality: 'ultrasound', ionizing: false, maintenance: [] };
const TYPED = { id: 'eq1', establishmentId: 'e1', name: 'Sala 2', modality: 'ultrasound', equipmentTypeKey: 'ultrasonido', operationalStatus: 'down' } as Equipment;
const UNTYPED = { id: 'eq2', establishmentId: 'e1', name: 'Sala 1', modality: 'xray' } as Equipment;

describe('SubjectsComponent · equipos', () => {
  let perms: string[];
  let dialog: jasmine.SpyObj<MatDialog>;

  function create(catalog: Observable<EquipmentCatalog> = of({ version: '2026-11-14', types: [US] })) {
    const api = jasmine.createSpyObj('FacilityApiService', ['equipment', 'personnel', 'equipmentCatalog']);
    api.equipment.and.returnValue(of([TYPED, UNTYPED]));
    api.personnel.and.returnValue(of([]));
    api.equipmentCatalog.and.returnValue(catalog);
    TestBed.configureTestingModule({
      imports: [SubjectsComponent],
      providers: [
        provideRouter([]),
        { provide: FacilityApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
        { provide: EstablishmentContextService, useValue: { current: signal({ id: 'e1', timeZone: 'America/Mexico_City' } as Establishment) } },
        { provide: PermissionsService, useValue: { can: (a: string) => perms.includes(`facility.${a}`) } },
      ],
    });
    const fixture = TestBed.createComponent(SubjectsComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    perms = ['facility.read'];
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as never);
  });

  it('cada equipo muestra su tipo, o su modalidad si no tiene, y el estado si no está operando', () => {
    const tiles = Array.from(create().el.querySelectorAll('.tile')).map((t) => t.textContent ?? '');

    expect(tiles[0]).toContain('Ultrasonido');
    expect(tiles[0]).toContain('Fuera de servicio');
    expect(tiles[1]).toContain('Rayos X');
    expect(tiles[1]).not.toContain('Operando');
  });

  it('con solo lectura se puede ver la ficha pero no editar', () => {
    const { el } = create();

    expect(el.textContent).toContain('Ver ficha');
    expect(el.textContent).not.toContain('Editar');
  });

  it('«Ver ficha» abre el detalle con los tipos del catálogo', () => {
    create().cmp.openDetail(TYPED);

    expect(dialog.open).toHaveBeenCalledWith(EquipmentDetailDialogComponent, jasmine.objectContaining({ data: jasmine.objectContaining({ equipment: TYPED, types: [US], today: jasmine.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }) }));
  });

  it('si el catálogo no cargó, el detalle lo recibe como null', () => {
    create(throwError(() => new Error('500'))).cmp.openDetail(TYPED);

    expect(dialog.open).toHaveBeenCalledWith(EquipmentDetailDialogComponent, jasmine.objectContaining({ data: jasmine.objectContaining({ equipment: TYPED, types: null }) }));
  });

  it('si la ficha cambió algo (un correctivo), vuelve a cargar los equipos', () => {
    dialog.open.and.returnValue({ afterClosed: () => of(true) } as never);
    const { cmp } = create();
    const api = TestBed.inject(FacilityApiService) as unknown as { equipment: jasmine.Spy };

    cmp.openDetail(TYPED);

    expect(api.equipment).toHaveBeenCalledTimes(2);
  });

  it('si la ficha se cerró sin cambios, no recarga', () => {
    const { cmp } = create();
    const api = TestBed.inject(FacilityApiService) as unknown as { equipment: jasmine.Spy };

    cmp.openDetail(TYPED);

    expect(api.equipment).toHaveBeenCalledTimes(1);
  });
});
