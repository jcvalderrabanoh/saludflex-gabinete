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

  it('registrar evidencia va como multipart con el archivo', () => {
    const file = new File(['%PDF-1.4'], 'dosimetria.pdf', { type: 'application/pdf' });
    api.recordEvidence('o1', { performedOn: '2026-10-31', file }).subscribe();
    const req = http.expectOne('http://localhost:3000/facility/obligations/o1/records');
    const body = req.request.body as FormData;
    expect(body.get('performedOn')).toBe('2026-10-31');
    expect((body.get('file') as File).name).toBe('dosimetria.pdf');
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
