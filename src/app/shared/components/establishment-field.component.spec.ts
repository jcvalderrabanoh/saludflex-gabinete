import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Establishment } from '../../core/models/facility.models';
import { EstablishmentContextService } from '../../core/services/establishment-context.service';
import { EstablishmentFieldComponent } from './establishment-field.component';

const MATRIZ = { id: 'est-1', name: 'Matriz Centro' } as Establishment;
const NORTE = { id: 'est-2', name: 'Sucursal Norte' } as Establishment;

@Component({
  standalone: true,
  imports: [EstablishmentFieldComponent],
  template: `<app-establishment-field [control]="control" [locked]="locked()" />`,
})
class HostComponent {
  readonly control = new FormControl('est-1', { nonNullable: true });
  readonly locked = signal(false);
}

function setup(establishments: Establishment[], locked = false) {
  TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideNoopAnimations()] });
  TestBed.inject(EstablishmentContextService).setEstablishments(establishments);
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.locked.set(locked);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
}

describe('EstablishmentFieldComponent', () => {
  it('con un solo establecimiento lo muestra fijo, sin selector', () => {
    const { element } = setup([MATRIZ]);

    expect(element.textContent).toContain('Establecimiento');
    expect(element.textContent).toContain('Matriz Centro');
    expect(element.querySelector('mat-select')).toBeNull();
  });

  it('con varios establecimientos deja elegir en cuál se registra', async () => {
    const { fixture, element } = setup([MATRIZ, NORTE]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('mat-select')).not.toBeNull();
    expect(element.textContent).toContain('Matriz Centro');
  });

  it('al elegir otro establecimiento avisa dónde lo verá', () => {
    const { fixture, host, element } = setup([MATRIZ, NORTE]);

    host.control.setValue('est-2');
    fixture.detectChanges();

    expect(element.textContent).toContain('Sucursal Norte');
    expect(element.textContent).toContain('cambia a ese establecimiento arriba');
  });

  it('al editar lo muestra fijo aunque haya varios, y dice cómo moverlo', () => {
    const { element } = setup([MATRIZ, NORTE], true);

    expect(element.querySelector('mat-select')).toBeNull();
    expect(element.textContent).toContain('Matriz Centro');
    expect(element.textContent).toContain('dalo de baja aquí y regístralo en el otro');
  });

  it('si el establecimiento ya no está en la lista no inventa un nombre', () => {
    const { host, fixture, element } = setup([MATRIZ]);

    host.control.setValue('desconocido');
    fixture.detectChanges();

    expect(element.textContent).toContain('Establecimiento');
    expect(element.textContent).not.toContain('Matriz Centro');
  });
});
