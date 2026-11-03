import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { TeamMember } from '../../core/models/facility.models';
import { FacilityApiService } from '../../core/services/facility-api.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { InviteMemberDialogComponent } from './invite-member.dialog';
import { TeamComponent } from './team.component';
import { PRESETS, canOperate, presetOf } from './team.helpers';

const member = (id: string, permissions: string[], extra: Partial<TeamMember> = {}): TeamMember => ({
  id,
  name: `Persona ${id}`,
  email: `${id}@clinica.mx`,
  status: 'active',
  permissions,
  isManager: false,
  ...extra,
});

describe('helpers de Equipo', () => {
  it('presetOf reconoce el preset por sus permisos', () => {
    expect(presetOf(['facility.read', 'facility.record'])).toBe('coordinador');
    expect(presetOf(['facility.read', 'facility.record.assigned'])).toBe('responsable');
    expect(presetOf(['facility.read'])).toBe('consulta');
    expect(presetOf([])).toBeNull();
  });

  it('cada preset explica en lenguaje llano lo que deja hacer', () => {
    expect(PRESETS.map((p) => p.value)).toEqual(['coordinador', 'responsable', 'consulta']);
    PRESETS.forEach((p) => expect(p.explanation.length).toBeGreaterThan(20));
  });

  it('no se opera sobre quien administra ni sobre uno mismo', () => {
    expect(canOperate(member('u1', ['facility.read']), 'u9')).toBeTrue();
    expect(canOperate(member('u1', ['facility.manage'], { isManager: true }), 'u9')).toBeFalse();
    expect(canOperate(member('u9', ['facility.read']), 'u9')).toBeFalse();
  });
});

describe('TeamComponent', () => {
  let api: jasmine.SpyObj<FacilityApiService>;
  let dialog: jasmine.SpyObj<MatDialog>;
  const team = [
    member('boss', ['facility.manage', 'facility.read'], { isManager: true }),
    member('me', ['facility.read', 'facility.record']),
    member('ana', ['facility.read', 'facility.record.assigned'], { status: 'invited' }),
    member('luis', ['facility.read', 'facility.record']),
  ];

  function create() {
    TestBed.configureTestingModule({
      imports: [TeamComponent],
      providers: [
        { provide: FacilityApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
        { provide: PermissionsService, useValue: { userId: () => 'me', can: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(TeamComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('FacilityApiService', ['team', 'resendInvitation', 'changePreset', 'removeTeamMember']);
    api.team.and.returnValue(of(team));
    api.resendInvitation.and.returnValue(of({ invited: true }));
    api.changePreset.and.returnValue(of(undefined));
    api.removeTeamMember.and.returnValue(of(undefined));
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    dialog.open.and.returnValue({ afterClosed: () => of({ member: team[2], invited: true }) } as MatDialogRef<unknown>);
  });

  it('dice que los usuarios son ilimitados, sin contador de puestos ni «licencias»', () => {
    const text = create().el.textContent!;
    expect(text).toContain('Usuarios ilimitados: el precio es por establecimiento.');
    expect(text.toLowerCase()).not.toContain('licencia');
    expect(text.toLowerCase()).not.toContain('puestos');
  });

  it('lista a todo el equipo con su estado', () => {
    const { el } = create();
    expect(el.querySelectorAll('.member').length).toBe(4);
    expect(el.textContent).toContain('Invitación pendiente');
  });

  it('a quien administra y a uno mismo no les muestra acciones', () => {
    const { el } = create();
    const rows = Array.from(el.querySelectorAll('.member'));
    expect(rows[0].querySelector('button')).toBeNull();
    expect(rows[1].querySelector('button')).toBeNull();
    expect(rows[3].textContent).toContain('Dar de baja');
  });

  it('«Reenviar invitación» solo para invitaciones pendientes', () => {
    const { el, cmp } = create();
    const rows = Array.from(el.querySelectorAll('.member'));
    expect(rows[2].textContent).toContain('Reenviar invitación');
    expect(rows[3].textContent).not.toContain('Reenviar invitación');
    cmp.resend(team[2]);
    expect(api.resendInvitation).toHaveBeenCalledWith('ana');
  });

  it('invitar abre el diálogo y recarga al cerrar', () => {
    const { cmp } = create();
    cmp.invite();
    expect(dialog.open).toHaveBeenCalledWith(InviteMemberDialogComponent, jasmine.any(Object));
    expect(api.team).toHaveBeenCalledTimes(2);
  });

  it('si se mandó la invitación, avisa que le llegará un correo', () => {
    const { cmp } = create();
    const open = spyOn(cmp['snack'], 'open');
    cmp.invite();
    expect(open).toHaveBeenCalledWith('Le llegará un correo para entrar.', 'OK', jasmine.any(Object));
  });

  it('si no se mandó correo (ya era de la cuenta o falló el envío), dice que se ajustaron permisos y cómo reenviar', () => {
    dialog.open.and.returnValue({ afterClosed: () => of({ member: team[2], invited: false }) } as MatDialogRef<unknown>);
    const { cmp } = create();
    const open = spyOn(cmp['snack'], 'open');
    cmp.invite();
    expect(open).toHaveBeenCalledWith('Ajustamos sus permisos. Si aún no ha entrado, usa Reenviar invitación.', 'OK', jasmine.any(Object));
    expect(api.team).toHaveBeenCalledTimes(2);
  });

  it('si se cancela el diálogo, no avisa ni recarga', () => {
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as MatDialogRef<unknown>);
    const { cmp } = create();
    const open = spyOn(cmp['snack'], 'open');
    cmp.invite();
    expect(open).not.toHaveBeenCalled();
    expect(api.team).toHaveBeenCalledTimes(1);
  });

  it('reenviar con correo enviado avisa que se reenvió', () => {
    const { cmp } = create();
    const open = spyOn(cmp['snack'], 'open');
    cmp.resend(team[2]);
    expect(open).toHaveBeenCalledWith('Reenviamos la invitación.', 'OK', jasmine.any(Object));
  });

  it('reenviar sin correo enviado explica que no se pudo y qué hacer', () => {
    api.resendInvitation.and.returnValue(of({ invited: false }));
    const { cmp, el, fixture } = create();
    const open = spyOn(cmp['snack'], 'open');
    cmp.resend(team[2]);
    fixture.detectChanges();
    expect(open).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('No pudimos mandar el correo. Intenta de nuevo en unos minutos.');
  });

  it('un 409 al reenviar muestra el mensaje del backend', () => {
    api.resendInvitation.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Esa persona ya entró al gabinete.' } })));
    const { cmp, el, fixture } = create();
    cmp.resend(team[2]);
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Esa persona ya entró al gabinete.');
  });

  it('cambiar preset llama a la API y recarga', () => {
    const { cmp } = create();
    cmp.changePreset(team[3], 'consulta');
    expect(api.changePreset).toHaveBeenCalledWith('luis', 'consulta');
    expect(api.team).toHaveBeenCalledTimes(2);
  });

  it('dar de baja pide confirmación', () => {
    const { cmp } = create();
    spyOn(window, 'confirm').and.returnValue(false);
    cmp.remove(team[3]);
    expect(api.removeTeamMember).not.toHaveBeenCalled();
    (window.confirm as jasmine.Spy).and.returnValue(true);
    cmp.remove(team[3]);
    expect(api.removeTeamMember).toHaveBeenCalledWith('luis');
  });

  it('si falla una acción, explica qué pasó', () => {
    api.removeTeamMember.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403, error: { message: 'No puedes dar de baja a quien administra el gabinete.' } })));
    const { cmp, el, fixture } = create();
    spyOn(window, 'confirm').and.returnValue(true);
    cmp.remove(team[3]);
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('No puedes dar de baja');
  });
});

describe('InviteMemberDialogComponent', () => {
  let api: jasmine.SpyObj<FacilityApiService>;
  let ref: jasmine.SpyObj<MatDialogRef<InviteMemberDialogComponent>>;

  function create() {
    TestBed.configureTestingModule({
      imports: [InviteMemberDialogComponent],
      providers: [
        { provide: FacilityApiService, useValue: api },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: null },
      ],
    });
    const fixture = TestBed.createComponent(InviteMemberDialogComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('FacilityApiService', ['inviteTeamMember']);
    api.inviteTeamMember.and.returnValue(of({ member: member('ana', ['facility.read']), invited: true }));
    ref = jasmine.createSpyObj('MatDialogRef', ['close']);
  });

  it('muestra los tres presets con su explicación', () => {
    const { el } = create();
    PRESETS.forEach((p) => {
      expect(el.textContent).toContain(p.label);
      expect(el.textContent).toContain(p.explanation);
    });
  });

  it('por omisión invita como responsable', () => {
    expect(create().cmp.form.controls.preset.value).toBe('responsable');
  });

  it('manda correo, nombre y preset y cierra', () => {
    const { cmp } = create();
    cmp.form.setValue({ name: ' Ana López ', email: ' ana@clinica.mx ', preset: 'coordinador' });
    cmp.save();
    expect(api.inviteTeamMember).toHaveBeenCalledWith({ name: 'Ana López', email: 'ana@clinica.mx', preset: 'coordinador' });
    expect(ref.close).toHaveBeenCalledWith({ member: member('ana', ['facility.read']), invited: true });
  });

  it('no deja mandar sin correo válido', () => {
    const { cmp } = create();
    cmp.form.setValue({ name: 'Ana', email: 'ana', preset: 'consulta' });
    cmp.save();
    expect(api.inviteTeamMember).not.toHaveBeenCalled();
  });

  it('si el backend rechaza, muestra el mensaje', () => {
    api.inviteTeamMember.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Ese correo ya es parte del equipo.' } })));
    const { cmp, el, fixture } = create();
    cmp.form.setValue({ name: 'Ana', email: 'ana@clinica.mx', preset: 'consulta' });
    cmp.save();
    fixture.detectChanges();
    expect(ref.close).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('ya es parte del equipo');
  });
});
