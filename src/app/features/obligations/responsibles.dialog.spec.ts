import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { EvaluatedObligation, TeamMember } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { MAX_RESPONSIBLES, ResponsiblesDialogComponent, eligibleResponsibles } from './responsibles.dialog';

const member = (id: string, permissions: string[], status: TeamMember['status'] = 'active'): TeamMember => ({
  id,
  name: `Persona ${id}`,
  email: `${id}@clinica.mx`,
  status,
  permissions,
  isManager: false,
});

const TEAM: TeamMember[] = [
  member('u1', ['facility.read', 'facility.record']),
  member('u2', ['facility.read', 'facility.record.assigned']),
  member('u3', ['facility.read']),
  member('u4', ['facility.read', 'facility.record'], 'inactive'),
  member('u5', ['facility.read', 'facility.record.assigned'], 'invited'),
];

describe('eligibleResponsibles', () => {
  it('solo quien puede capturar y no está dado de baja', () => {
    expect(eligibleResponsibles(TEAM).map((m) => m.id)).toEqual(['u1', 'u2', 'u5']);
  });
});

describe('ResponsiblesDialogComponent', () => {
  let api: jasmine.SpyObj<FacilityApiService>;
  let ref: jasmine.SpyObj<MatDialogRef<ResponsiblesDialogComponent>>;
  let obligation: EvaluatedObligation;

  function create() {
    TestBed.configureTestingModule({
      imports: [ResponsiblesDialogComponent],
      providers: [
        { provide: FacilityApiService, useValue: api },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { obligation } },
      ],
    });
    const fixture = TestBed.createComponent(ResponsiblesDialogComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('FacilityApiService', ['team', 'setResponsibles']);
    api.team.and.returnValue(of(TEAM));
    api.setResponsibles.and.returnValue(of({}));
    ref = jasmine.createSpyObj('MatDialogRef', ['close']);
    obligation = {
      id: 'o1',
      title: 'Dosimetría personal',
      responsibleUserIds: ['u2', 'u3'],
      responsibles: [
        { id: 'u2', name: 'Persona u2', valid: true },
        { id: 'u3', name: 'Persona u3', valid: false },
      ],
    } as unknown as EvaluatedObligation;
  });

  it('ofrece solo a quienes pueden capturar', () => {
    const { el } = create();
    const options = Array.from(el.querySelectorAll('mat-list-option')).map((o) => o.textContent);
    expect(options.length).toBe(3);
    expect(options.join(' ')).not.toContain('Persona u3');
    expect(options.join(' ')).toContain('invitación pendiente');
  });

  it('marca a los responsables válidos actuales', () => {
    const { cmp } = create();
    expect(cmp.selected()).toEqual(['u2']);
  });

  it('avisa que un responsable inválido se quita al guardar', () => {
    const { el } = create();
    expect(el.textContent).toContain('Responsable inválido');
    expect(el.textContent).toContain('Persona u3');
  });

  it('guarda los ids elegidos y cierra', () => {
    const { cmp } = create();
    cmp.toggle('u1', true);
    cmp.save();
    expect(api.setResponsibles).toHaveBeenCalledWith('o1', ['u2', 'u1']);
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it(`no deja elegir más de ${MAX_RESPONSIBLES}`, () => {
    const many = Array.from({ length: 12 }, (_, i) => member(`m${i}`, ['facility.record']));
    api.team.and.returnValue(of(many));
    obligation = { ...obligation, responsibleUserIds: [], responsibles: [] };
    const { cmp } = create();
    many.forEach((m) => cmp.toggle(m.id, true));
    expect(cmp.selected().length).toBe(MAX_RESPONSIBLES);
  });

  it('si el backend rechaza, muestra su mensaje y no cierra', () => {
    api.setResponsibles.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'El responsable no pertenece a esta cuenta o no puede capturar' } })),
    );
    const { cmp, el, fixture } = create();
    cmp.save();
    fixture.detectChanges();
    expect(ref.close).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('no pertenece a esta cuenta');
  });

  it('si nadie puede capturar, explica cómo resolverlo', () => {
    api.team.and.returnValue(of([member('u3', ['facility.read'])]));
    const { el } = create();
    expect(el.textContent).toContain('Invita a alguien en «Equipo»');
  });
});
