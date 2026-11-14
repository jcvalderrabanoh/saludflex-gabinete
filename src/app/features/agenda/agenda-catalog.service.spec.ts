import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { PermissionsService } from '../../core/services/permissions.service';
import { AgendaCatalogService, equipmentSavedMessage } from './agenda-catalog.service';
import { AgendaEquipmentDialogComponent } from './agenda-equipment.dialog';
import { ServiceTypeDialogComponent } from './service-type.dialog';

const SERVICE = { id: 's1', name: 'Ultrasonido abdominal', modality: 'ultrasound', durationMinutes: 20, preparation: null };
const EQUIPMENT = { id: 'us1', name: 'Ultrasonido 1', modality: 'ultrasound', room: null };

function setup(granted: string[], closesWith: unknown = undefined) {
  const dialog = { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(closesWith) }) };
  const snack = { open: jasmine.createSpy('open') };
  const permissions = { can: (action: string) => granted.includes(action) };
  // Los casos de permisos comparan varias combinaciones en el mismo caso.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: MatDialog, useValue: dialog },
      { provide: MatSnackBar, useValue: snack },
      { provide: PermissionsService, useValue: permissions },
    ],
  });
  return { catalog: TestBed.inject(AgendaCatalogService), dialog, snack };
}

describe('AgendaCatalogService', () => {
  describe('permisos', () => {
    it('agregar o editar servicios pide configurar la agenda', () => {
      expect(setup(['agendaConfigure']).catalog.canEditServices()).toBeTrue();
      expect(setup(['agendaManage', 'manage']).catalog.canEditServices()).toBeFalse();
    });

    it('agregar equipos pide registrar equipos y configurar la agenda (alta y horario van juntos)', () => {
      expect(setup(['manage', 'agendaConfigure']).catalog.canEditEquipment()).toBeTrue();
      expect(setup(['manage']).catalog.canEditEquipment()).toBeFalse();
      expect(setup(['agendaConfigure']).catalog.canEditEquipment()).toBeFalse();
    });
  });

  describe('servicios', () => {
    it('agregar abre el diálogo con los equipos del establecimiento y devuelve el servicio nuevo', (done) => {
      const { catalog, dialog } = setup(['agendaConfigure'], SERVICE);

      catalog.addService('est', [], 'ultrasound').subscribe((saved) => {
        expect(saved).toEqual(SERVICE);
        done();
      });

      expect(dialog.open).toHaveBeenCalledWith(ServiceTypeDialogComponent, jasmine.objectContaining({ data: { equipment: [], establishmentId: 'est', modality: 'ultrasound' } }));
    });

    it('editar abre el diálogo con el servicio', () => {
      const { catalog, dialog } = setup(['agendaConfigure'], SERVICE);

      catalog.editService(SERVICE, 'est', []).subscribe();

      expect(dialog.open).toHaveBeenCalledWith(ServiceTypeDialogComponent, jasmine.objectContaining({ data: { editing: SERVICE, equipment: [], establishmentId: 'est' } }));
    });

    it('cancelar no devuelve nada', (done) => {
      const { catalog } = setup(['agendaConfigure'], undefined);
      catalog.addService('est', []).subscribe({ next: () => fail('no debía emitir'), complete: done });
    });
  });

  describe('equipos', () => {
    it('agregar abre el diálogo con la modalidad del servicio y avisa lo que se activó', (done) => {
      const result = { equipmentId: 'us1', name: 'Ultrasonido 1', created: true, hoursSaved: true, activated: 1 };
      const { catalog, dialog, snack } = setup(['manage', 'agendaConfigure'], result);

      catalog.addEquipment('est', 'ultrasound').subscribe((saved) => {
        expect(saved).toEqual(result);
        done();
      });

      expect(dialog.open).toHaveBeenCalledWith(AgendaEquipmentDialogComponent, jasmine.objectContaining({ data: { establishmentId: 'est', modality: 'ultrasound' } }));
      expect(snack.open).toHaveBeenCalledWith(equipmentSavedMessage(result), 'OK', jasmine.any(Object));
    });

    it('cada guardado se cuenta para que la agenda se vuelva a leer; cancelar no cuenta', () => {
      const { catalog } = setup(['manage', 'agendaConfigure'], SERVICE);
      catalog.addService('est', []).subscribe();
      expect(catalog.saved()).toBe(1);

      const cancelled = setup(['manage', 'agendaConfigure'], undefined).catalog;
      cancelled.addEquipment('est').subscribe();
      expect(cancelled.saved()).toBe(0);
    });

    it('editar abre el diálogo con el equipo', () => {
      const { catalog, dialog } = setup(['manage', 'agendaConfigure'], undefined);

      catalog.editEquipment('est', EQUIPMENT).subscribe();

      expect(dialog.open).toHaveBeenCalledWith(AgendaEquipmentDialogComponent, jasmine.objectContaining({ data: { establishmentId: 'est', editing: EQUIPMENT } }));
    });
  });

  describe('equipmentSavedMessage', () => {
    it('dice que ya se puede agendar y cuántas obligaciones se activaron', () => {
      expect(equipmentSavedMessage({ equipmentId: 'x', name: 'Ultrasonido 1', created: true, hoursSaved: true, activated: 2 })).toBe(
        'Ultrasonido 1 agregado: ya se puede agendar en él. Se activaron 2 obligaciones; revísalas en «Hoy».',
      );
      expect(equipmentSavedMessage({ equipmentId: 'x', name: 'Ultrasonido 1', created: true, hoursSaved: true, activated: 0 })).toBe('Ultrasonido 1 agregado: ya se puede agendar en él.');
    });

    it('si el horario no se guardó, dice dónde capturarlo', () => {
      expect(equipmentSavedMessage({ equipmentId: 'x', name: 'Ultrasonido 1', created: true, hoursSaved: false, activated: 0 })).toBe(
        'Ultrasonido 1 agregado, pero su horario no se guardó. Captúralo en «Configurar agenda» › «Horarios y bloqueos» para poder agendar en él.',
      );
    });

    it('al editar solo confirma', () => {
      expect(equipmentSavedMessage({ equipmentId: 'x', name: 'Ultrasonido A', created: false, hoursSaved: true, activated: 0 })).toBe('Ultrasonido A guardado.');
    });
  });
});
