import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Establishment, EstablishmentStatus, EvaluatedObligation } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { ObligationsComponent } from './obligations.component';
import { ResponsiblesDialogComponent } from './responsibles.dialog';

const obligation = (id: string, responsibles: EvaluatedObligation['responsibles']) =>
  ({
    id,
    title: `Obligación ${id}`,
    norms: ['NOM-229'],
    folderOrder: 2,
    status: 'missing',
    verification: 'V',
    responsibleUserIds: (responsibles ?? []).map((r) => r.id),
    responsibles,
    currentRecord: null,
  }) as unknown as EvaluatedObligation;

describe('ObligationsComponent', () => {
  let perms: string[];
  let dialog: jasmine.SpyObj<MatDialog>;

  function create() {
    const api = jasmine.createSpyObj('FacilityApiService', ['status']);
    api.status.and.returnValue(
      of({
        today: '2026-11-02',
        obligations: [
          obligation('o1', [{ id: 'u1', name: 'Ana López', valid: true }]),
          obligation('o2', [{ id: 'u2', name: 'Luis Pérez', valid: false }]),
          obligation('o3', []),
        ],
      } as unknown as EstablishmentStatus),
    );
    TestBed.configureTestingModule({
      imports: [ObligationsComponent],
      providers: [
        { provide: FacilityApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
        { provide: EstablishmentContextService, useValue: { current: signal({ id: 'e1' } as Establishment) } },
        {
          provide: PermissionsService,
          useValue: {
            can: (a: string) => (a === 'record' ? perms.some((p) => p.startsWith('facility.record')) : perms.includes(`facility.${a}`)),
            canRecord: (o: EvaluatedObligation) => perms.includes('facility.record') || (perms.includes('facility.record.assigned') && o.responsibleUserIds.includes('u1')),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ObligationsComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    perms = ['facility.read', 'facility.manage', 'facility.record'];
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as never);
  });

  it('muestra la columna «Responsable» con nombres, «Sin asignar» y el aviso de inválido', () => {
    const rows = Array.from(create().el.querySelectorAll('.row')).map((r) => r.querySelector('.responsible')?.textContent ?? '');
    expect(rows[0]).toContain('Ana López');
    expect(rows[1]).toContain('Luis Pérez');
    expect(rows[1]).toContain('Responsable inválido');
    expect(rows[2]).toContain('Sin asignar');
  });

  it('quien administra puede activar obligaciones', () => {
    expect(create().el.textContent).toContain('Activar obligación');
  });

  it('sin facility.manage no ofrece activar', () => {
    perms = ['facility.read', 'facility.record.assigned'];
    expect(create().el.textContent).not.toContain('Activar obligación');
  });

  it('con permiso asignado, «Registrar» solo en sus obligaciones', () => {
    perms = ['facility.read', 'facility.record.assigned'];
    const rows = Array.from(create().el.querySelectorAll('.row'));
    expect(rows[0].textContent).toContain('Registrar');
    expect(rows[1].textContent).not.toContain('Registrar');
  });

  it('«Asignar responsables» abre el diálogo con la obligación', () => {
    const { cmp } = create();
    const o = obligation('o1', []);
    cmp.assign(o);
    expect(dialog.open).toHaveBeenCalledWith(ResponsiblesDialogComponent, jasmine.objectContaining({ data: { obligation: o } }));
  });
});
