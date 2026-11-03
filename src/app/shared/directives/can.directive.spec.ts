import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EvaluatedObligation } from '../../core/models/facility.models';
import { PermissionsService } from '../../core/services/permissions.service';
import { CanDirective, CanRecordDirective } from './can.directive';

@Component({
  standalone: true,
  imports: [CanDirective, CanRecordDirective],
  template: `
    <button *appCan="'manage'" id="manage">Desactivar</button>
    <button *appCan="'inspect'" id="inspect">Descargar carpeta</button>
    <button *appCanRecord="obligation()" id="record">Registrar</button>
  `,
})
class HostComponent {
  readonly obligation = signal({ id: 'o1', responsibleUserIds: ['u1'] } as unknown as EvaluatedObligation);
}

describe('CanDirective / CanRecordDirective', () => {
  function render(permissions: string[], userId = 'u1') {
    const perms = signal(permissions);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        {
          provide: PermissionsService,
          useValue: {
            can: (action: string) =>
              action === 'record'
                ? perms().some((p) => p.startsWith('facility.record'))
                : perms().includes(`facility.${action}`),
            canRecord: (o: EvaluatedObligation) =>
              perms().includes('facility.record') ||
              (perms().includes('facility.record.assigned') && o.responsibleUserIds.includes(userId)),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, perms };
  }

  it('oculta lo que el permiso no deja usar', () => {
    const { el } = render(['facility.read']);
    expect(el.querySelector('#manage')).toBeNull();
    expect(el.querySelector('#inspect')).toBeNull();
    expect(el.querySelector('#record')).toBeNull();
  });

  it('muestra lo que sí deja usar', () => {
    const { el } = render(['facility.manage', 'facility.inspect', 'facility.record']);
    expect(el.querySelector('#manage')).not.toBeNull();
    expect(el.querySelector('#inspect')).not.toBeNull();
    expect(el.querySelector('#record')).not.toBeNull();
  });

  it('registrar con permiso asignado depende de la obligación', () => {
    const { el, fixture } = render(['facility.record.assigned']);
    expect(el.querySelector('#record')).not.toBeNull();
    fixture.componentInstance.obligation.set({ id: 'o2', responsibleUserIds: ['u2'] } as unknown as EvaluatedObligation);
    fixture.detectChanges();
    expect(el.querySelector('#record')).toBeNull();
  });

  it('reacciona si cambian los permisos', () => {
    const { el, fixture, perms } = render([]);
    expect(el.querySelector('#manage')).toBeNull();
    perms.set(['facility.manage']);
    fixture.detectChanges();
    expect(el.querySelector('#manage')).not.toBeNull();
  });
});
