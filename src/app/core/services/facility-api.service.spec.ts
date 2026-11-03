import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityApiService, clean, toForm } from './facility-api.service';

describe('FacilityApiService', () => {
  let api: FacilityApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(FacilityApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('crear establecimiento manda solo campos con valor y devuelve el establecimiento', () => {
    let name = '';
    api
      .createEstablishment({ name: 'UDIX', type: 'gabinete-imagen', services: ['xray'], rfc: '', clues: null })
      .subscribe((e) => (name = e.name));
    const req = http.expectOne('http://localhost:3000/facility/establishments');
    expect(req.request.body).toEqual({ name: 'UDIX', type: 'gabinete-imagen', services: ['xray'] });
    req.flush({ establishment: { name: 'UDIX' }, activated: [] });
    expect(name).toBe('UDIX');
  });

  it('las citas se piden por rango de fechas del establecimiento', () => {
    api.appointments('e1', { from: '2026-11-01', to: '2026-11-30' }).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/establishments/e1/appointments?from=2026-11-01&to=2026-11-30');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('programar una cita manda solo campos con valor', () => {
    api
      .scheduleAppointment('e1', { kind: 'service', scheduledOn: '2026-11-15', startTime: '', obligationId: 'o1', title: '' })
      .subscribe();
    const req = http.expectOne('http://localhost:3000/facility/establishments/e1/appointments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ kind: 'service', scheduledOn: '2026-11-15', obligationId: 'o1' });
    req.flush({});
  });

  it('marcar como hecha y cancelar van a la cita', () => {
    api.updateAppointment('a1', { state: 'done' }).subscribe();
    const patch = http.expectOne('http://localhost:3000/facility/appointments/a1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ state: 'done' });
    patch.flush({});
    api.cancelAppointment('a1').subscribe();
    expect(http.expectOne('http://localhost:3000/facility/appointments/a1').request.method).toBe('DELETE');
  });

  it('editar una cita manda null para borrar hora, lugar u obligación y omite lo que no cambia', () => {
    api.updateAppointment('a1', { title: 'Fumigación', startTime: null, location: null, notes: undefined }).subscribe();
    const patch = http.expectOne('http://localhost:3000/facility/appointments/a1');
    expect(patch.request.body).toEqual({ title: 'Fumigación', startTime: null, location: null });
    patch.flush({});
  });

  it('registrar evidencia va como multipart con el archivo', () => {
    const file = new File(['%PDF-1.4'], 'dosimetria.pdf', { type: 'application/pdf' });
    api.recordEvidence('o1', { performedOn: '2026-10-31', file }).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/obligations/o1/records');
    const body = req.request.body as FormData;
    expect(body.get('performedOn')).toBe('2026-10-31');
    expect((body.get('file') as File).name).toBe('dosimetria.pdf');
    req.flush({});
  });

  it('analizar un documento manda solo el archivo al establecimiento', () => {
    const file = new File(['%PDF-1.4'], 'licencia.pdf', { type: 'application/pdf' });
    let overall = -1;
    api.analyzeEvidence('e1', file).subscribe((a) => (overall = a.confidence.overall));
    const req = http.expectOne('http://localhost:3000/facility/establishments/e1/evidence/analyze');
    expect(req.request.method).toBe('POST');
    expect((req.request.body as FormData).get('file')).toBeTruthy();
    req.flush({ confidence: { overall: 88 } });
    expect(overall).toBe(88);
  });

  it('subir a la bandeja manda el archivo y la confirmación de que no trae datos de pacientes', () => {
    const file = new File(['%PDF-1.4'], 'aviso.pdf', { type: 'application/pdf' });
    api.uploadDocument('e1', file).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/establishments/e1/documents');
    const body = req.request.body as FormData;
    expect(body.get('noPatientData')).toBe('true');
    expect((body.get('file') as File).name).toBe('aviso.pdf');
    req.flush({ document: {}, duplicate: false });
  });

  it('ligar un documento manda la obligación y las fechas confirmadas', () => {
    api.linkDocument('d1', { obligationId: 'o1', performedOn: '2026-10-01', validUntil: '', notes: '' }).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/documents/d1/link');
    expect(req.request.body).toEqual({ obligationId: 'o1', performedOn: '2026-10-01' });
    req.flush({});
  });

  it('la carpeta completa (ZIP) se pide como blob', () => {
    api.inspectionPackage('e1').subscribe();
    const req = http.expectOne('http://localhost:3000/facility/establishments/e1/inspection-package');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['PK']));
  });

  it('la carpeta se pide como blob', () => {
    api.inspectionFolder('e1').subscribe();
    const req = http.expectOne('http://localhost:3000/facility/establishments/e1/inspection-folder');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF']));
  });

  it('Hoy con «Mis pendientes» manda ?mine=true; sin filtro, la ruta de siempre', () => {
    api.status('e1', { mine: true }).subscribe();
    const mine = http.expectOne((r) => r.url === 'http://localhost:3000/facility/establishments/e1/status');
    expect(mine.request.params.get('mine')).toBe('true');
    mine.flush({});
    api.status('e1').subscribe();
    const all = http.expectOne('http://localhost:3000/facility/establishments/e1/status');
    expect(all.request.params.has('mine')).toBeFalse();
    all.flush({});
  });

  it('asignar responsables hace PATCH a la obligación solo con los ids', () => {
    api.setResponsibles('o1', ['u1', 'u2']).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/obligations/o1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ responsibleUserIds: ['u1', 'u2'] });
    req.flush({});
  });

  it('poner el plazo de pago manda las dos fechas', () => {
    api.setPaymentWindow('o1', { startsOn: '2027-01-01', endsOn: '2027-03-31' }).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/obligations/o1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ windowStartsOn: '2027-01-01', windowEndsOn: '2027-03-31' });
    req.flush({});
  });

  it('quitar el plazo manda las dos fechas en null', () => {
    api.setPaymentWindow('o1', null).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/obligations/o1');
    expect(req.request.body).toEqual({ windowStartsOn: null, windowEndsOn: null });
    req.flush({});
  });

  it('asignar cero responsables manda la lista vacía (no la quita)', () => {
    api.setResponsibles('o1', []).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/obligations/o1');
    expect(req.request.body).toEqual({ responsibleUserIds: [] });
    req.flush({});
  });

  describe('equipo', () => {
    it('lista el equipo de la cuenta', () => {
      let n = 0;
      api.team().subscribe((list) => (n = list.length));
      const req = http.expectOne('http://localhost:3000/facility/team');
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 'u1' }, { id: 'u2' }]);
      expect(n).toBe(2);
    });

    it('invitar manda correo, nombre y preset y devuelve la persona y si se mandó el correo', () => {
      let invited: boolean | undefined;
      let memberId: string | undefined;
      api.inviteTeamMember({ email: 'ana@clinica.mx', name: 'Ana López', preset: 'responsable' }).subscribe((r) => {
        invited = r.invited;
        memberId = r.member.id;
      });
      const req = http.expectOne('http://localhost:3000/facility/team/invitations');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'ana@clinica.mx', name: 'Ana López', preset: 'responsable' });
      req.flush({ member: { id: 'u1' }, invited: false });
      expect(invited).toBeFalse();
      expect(memberId).toBe('u1');
    });

    it('reenviar la invitación devuelve si se mandó el correo', () => {
      let invited: boolean | undefined;
      api.resendInvitation('u1').subscribe((r) => (invited = r.invited));
      const req = http.expectOne('http://localhost:3000/facility/team/u1/resend');
      expect(req.request.method).toBe('POST');
      req.flush({ invited: true });
      expect(invited).toBeTrue();
    });

    it('cambiar preset hace PATCH con el preset', () => {
      api.changePreset('u1', 'consulta').subscribe();
      const req = http.expectOne('http://localhost:3000/facility/team/u1');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ preset: 'consulta' });
      req.flush({});
    });

    it('dar de baja hace DELETE', () => {
      api.removeTeamMember('u1').subscribe();
      const req = http.expectOne('http://localhost:3000/facility/team/u1');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  it('los listados se piden como blob en el formato elegido', () => {
    api.exportLists('e1', 'csv').subscribe();
    const req = http.expectOne('http://localhost:3000/facility/establishments/e1/export?format=csv');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['PK']));
  });
});

describe('clean / toForm', () => {
  it('clean quita vacíos y nulos, conserva ceros y falsos', () => {
    expect(clean({ a: '', b: null, c: undefined, d: 0, e: false, f: 'x' })).toEqual({ d: 0, e: false, f: 'x' });
  });

  it('toForm omite lo vacío y recorta notas y motivo', () => {
    const form = toForm({ performedOn: '2026-10-31', validUntil: '', notes: '  ok  ', correctionReason: '   ' });
    expect(form.get('validUntil')).toBeNull();
    expect(form.get('notes')).toBe('ok');
    expect(form.get('correctionReason')).toBeNull();
  });
});
