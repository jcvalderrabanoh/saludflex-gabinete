import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { EvaluatedObligation } from '../models/facility.models';
import { User } from '../../shared/interfaces/user.interface';
import { AuthService } from './auth.service';
import { PermissionsService, can, canRecordObligation } from './permissions.service';

const obligation = (responsibleUserIds: string[]) => ({ id: 'o1', responsibleUserIds }) as unknown as EvaluatedObligation;

describe('permisos del gabinete', () => {
  describe('can', () => {
    it('administrar solo con facility.manage', () => {
      expect(can(['facility.read', 'facility.manage'], 'manage')).toBeTrue();
      expect(can(['facility.read', 'facility.record'], 'manage')).toBeFalse();
    });

    it('registrar con facility.record o con facility.record.assigned', () => {
      expect(can(['facility.record'], 'record')).toBeTrue();
      expect(can(['facility.record.assigned'], 'record')).toBeTrue();
      expect(can(['facility.read'], 'record')).toBeFalse();
    });

    it('la carpeta solo con facility.inspect', () => {
      expect(can(['facility.inspect'], 'inspect')).toBeTrue();
      expect(can(['facility.manage', 'facility.record'], 'inspect')).toBeFalse();
    });

    it('sin permisos no deja nada', () => {
      expect(can([], 'read')).toBeFalse();
      expect(can(undefined, 'record')).toBeFalse();
    });
  });

  describe('canRecordObligation', () => {
    it('el permiso global registra en cualquier obligación', () => {
      expect(canRecordObligation(['facility.record'], 'u1', obligation([]))).toBeTrue();
    });

    it('el permiso asignado solo registra donde es responsable', () => {
      expect(canRecordObligation(['facility.record.assigned'], 'u1', obligation(['u1']))).toBeTrue();
      expect(canRecordObligation(['facility.record.assigned'], 'u1', obligation(['u2']))).toBeFalse();
    });

    it('si tiene ambos, gana el global', () => {
      expect(canRecordObligation(['facility.record', 'facility.record.assigned'], 'u1', obligation(['u2']))).toBeTrue();
    });

    it('sin permiso de captura no registra aunque sea responsable', () => {
      expect(canRecordObligation(['facility.read'], 'u1', obligation(['u1']))).toBeFalse();
    });

    it('sin usuario no registra con el permiso asignado', () => {
      expect(canRecordObligation(['facility.record.assigned'], null, obligation(['u1']))).toBeFalse();
    });
  });

  describe('PermissionsService', () => {
    let user$: BehaviorSubject<User | null>;

    function setup(permissions: string[]): PermissionsService {
      user$ = new BehaviorSubject<User | null>({ id: 'u1', permissions } as User);
      TestBed.configureTestingModule({
        providers: [{ provide: AuthService, useValue: { currentUser$: user$, getCurrentUser: () => user$.value } }],
      });
      return TestBed.inject(PermissionsService);
    }

    it('expone si el usuario puede cada acción y su id', () => {
      const service = setup(['facility.read', 'facility.record.assigned']);
      expect(service.can('record')).toBeTrue();
      expect(service.can('manage')).toBeFalse();
      expect(service.userId()).toBe('u1');
      expect(service.canRecord(obligation(['u1']))).toBeTrue();
      expect(service.canRecord(obligation(['u9']))).toBeFalse();
    });

    it('se actualiza cuando cambia la sesión', () => {
      const service = setup(['facility.read']);
      expect(service.can('manage')).toBeFalse();
      user$.next({ id: 'u1', permissions: ['facility.manage'] } as User);
      expect(service.can('manage')).toBeTrue();
      user$.next(null);
      expect(service.can('manage')).toBeFalse();
    });
  });
});
