import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Establishment, EstablishmentStatus, EvaluatedObligation } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { TodayComponent, resolveMine } from './today.component';

const item = (id: string, responsibleUserIds: string[]) =>
  ({
    id,
    title: `Obligación ${id}`,
    evidence: 'PDF',
    norms: ['NOM-229'],
    status: 'missing',
    responsibleUserIds,
    responsibles: [],
    currentRecord: null,
  }) as unknown as EvaluatedObligation;

const status = (todayItems: EvaluatedObligation[]) =>
  ({
    establishmentId: 'e1',
    establishmentName: 'UDIX Centro',
    today: '2026-11-02',
    score: { percent: 50, total: 2, ok: 1, dueSoon: 0, overdue: 0, missing: 1 },
    obligations: todayItems,
    todayItems,
  }) as unknown as EstablishmentStatus;

describe('resolveMine', () => {
  it('la liga del correo (?mine=1 o ?mine=true) abre «Mis pendientes»', () => {
    expect(resolveMine('1', true)).toBeTrue();
    expect(resolveMine('true', true)).toBeTrue();
  });

  it('?mine=0 abre «Todos» aunque no administre', () => {
    expect(resolveMine('0', false)).toBeFalse();
    expect(resolveMine('false', false)).toBeFalse();
  });

  it('sin parámetro: quien no administra ve lo suyo; quien administra ve todo', () => {
    expect(resolveMine(null, false)).toBeTrue();
    expect(resolveMine(null, true)).toBeFalse();
  });
});

describe('TodayComponent', () => {
  let api: jasmine.SpyObj<FacilityApiService>;
  let query: Record<string, string>;
  let perms: string[];

  function create() {
    TestBed.configureTestingModule({
      imports: [TodayComponent],
      providers: [
        provideRouter([]),
        { provide: FacilityApiService, useValue: api },
        { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
        { provide: ActivatedRoute, useFactory: () => ({ snapshot: { queryParamMap: convertToParamMap(query) } }) },
        { provide: EstablishmentContextService, useValue: { current: signal({ id: 'e1' } as Establishment) } },
        {
          provide: PermissionsService,
          useValue: {
            can: (a: string) => (a === 'record' ? perms.some((p) => p.startsWith('facility.record')) : perms.includes(`facility.${a}`)),
            canRecord: (o: EvaluatedObligation) => perms.includes('facility.record') || o.responsibleUserIds.includes('u1'),
            userId: () => 'u1',
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(TodayComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, router };
  }

  beforeEach(() => {
    query = {};
    perms = ['facility.read', 'facility.record.assigned'];
    api = jasmine.createSpyObj('FacilityApiService', ['status']);
    api.status.and.returnValue(of(status([item('o1', ['u1'])])));
  });

  it('quien no administra entra a «Mis pendientes» (pide ?mine=true)', () => {
    const { el } = create();
    expect(api.status).toHaveBeenCalledWith('e1', { mine: true });
    expect(el.textContent).toContain('Mis pendientes');
  });

  it('quien administra entra a «Todos»', () => {
    perms = ['facility.read', 'facility.manage', 'facility.record'];
    create();
    expect(api.status).toHaveBeenCalledWith('e1', { mine: false });
  });

  it('respeta ?mine=1 de la liga del correo aunque administre', () => {
    perms = ['facility.read', 'facility.manage'];
    query = { mine: '1' };
    create();
    expect(api.status).toHaveBeenCalledWith('e1', { mine: true });
  });

  it('el conmutador «Todos» vuelve a pedir sin filtro y lo deja en la URL', () => {
    const { fixture, router } = create();
    fixture.componentInstance.setMine(false);
    fixture.detectChanges();
    expect(api.status).toHaveBeenCalledWith('e1', { mine: false });
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { mine: 0 }, replaceUrl: true }));
  });

  it('muestra «Míos» y «Todos»', () => {
    const { el } = create();
    const labels = Array.from(el.querySelectorAll('mat-button-toggle')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Míos', 'Todos']);
  });

  it('«Registrar» solo aparece en lo que el usuario puede capturar', () => {
    api.status.and.returnValue(of(status([item('o1', ['u1']), item('o2', ['u2'])])));
    const { el } = create();
    const rows = Array.from(el.querySelectorAll('article.item'));
    expect(rows[0].textContent).toContain('Registrar');
    expect(rows[1].textContent).not.toContain('Registrar');
  });

  it('sin permiso de captura no ofrece «Subir documento»', () => {
    perms = ['facility.read'];
    const { el } = create();
    expect(el.textContent).not.toContain('Subir documento');
  });

  it('en «Mis pendientes» sin nada asignado lo dice y explica cómo ver todo', () => {
    api.status.and.returnValue(of(status([])));
    const { el } = create();
    expect(el.textContent).toContain('No tienes pendientes asignados');
  });
});
