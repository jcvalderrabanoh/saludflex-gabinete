import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SetupSessionView } from './help.models';
import { SetupAssistantService } from './setup-assistant.service';

/** Deja correr las promesas pendientes (la recarga tras un 409). */
const nextTick = () => new Promise((resolve) => setTimeout(resolve));

const BASE = 'http://localhost:3000/facility/setup-assistant/session';

function view(overrides: Partial<SetupSessionView> = {}): SetupSessionView {
  return {
    status: 'active',
    currentStep: 'establishment',
    steps: [{ key: 'establishment', title: 'Establecimiento', status: 'in_progress' }],
    prompt: { kind: 'question', step: 'establishment', field: 'establishmentName', text: '¿Cómo se llama?', input: 'text', draftVersion: 1 },
    ...overrides,
  };
}

describe('SetupAssistantService', () => {
  let setup: SetupAssistantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    setup = TestBed.inject(SetupAssistantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('arrancar usa las rutas de Gabinete y guarda la vista', async () => {
    const done = setup.start();
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(view());
    expect(await done).toEqual({ ok: true });
    expect(setup.view()?.currentStep).toBe('establishment');
  });

  it('arrancar en un paso lo manda en el cuerpo', async () => {
    const done = setup.start('team');
    const req = http.expectOne(BASE);
    expect(req.request.body).toEqual({ step: 'team' });
    req.flush(view());
    await done;
  });

  it('responder manda paso, campo y valor, y lo deja en el historial con la etiqueta legible', async () => {
    const done = setup.answer('establishment', 'establishmentType', 'gabinete-imagen', 'Gabinete de imagen');
    const req = http.expectOne(`${BASE}/answer`);
    expect(req.request.body).toEqual({ step: 'establishment', field: 'establishmentType', value: 'gabinete-imagen' });
    req.flush(view());
    await done;
    expect(setup.history().at(-1)).toEqual({ from: 'user', text: 'Gabinete de imagen' });
  });

  it('confirmar manda la versión del borrador que vio el usuario', async () => {
    const done = setup.confirm('establishment', 7);
    const req = http.expectOne(`${BASE}/confirm`);
    expect(req.request.body).toEqual({ step: 'establishment', draftVersion: 7 });
    req.flush(view());
    expect(await done).toEqual({ ok: true });
    expect(setup.history().at(-1)).toEqual({ from: 'user', text: 'Confirmar' });
  });

  it('un 409 recarga el progreso y avisa, sin dar por guardado nada', async () => {
    const done = setup.confirm('establishment', 2);
    http.expectOne(`${BASE}/confirm`).flush({ message: 'Esa confirmación ya no está vigente.' }, { status: 409, statusText: 'Conflict' });
    await nextTick();
    http.expectOne(BASE).flush(view({ currentStep: 'team' }));
    expect(await done).toEqual({ ok: false, error: 'Esa confirmación ya no está vigente.' });
    expect(setup.view()?.currentStep).toBe('team');
    expect(setup.history()).toEqual([]);
  });

  it('otro error de red dice qué pasó sin cambiar la vista', async () => {
    const started = setup.start();
    http.expectOne(BASE).flush(view());
    await started;
    const done = setup.skip('establishment');
    http.expectOne(`${BASE}/skip`).flush({}, { status: 500, statusText: 'Error' });
    expect(await done).toEqual({ ok: false, error: 'No pudimos conectar. Intenta de nuevo en un momento.' });
    expect(setup.view()?.currentStep).toBe('establishment');
  });

  it('corregir, omitir y empezar de nuevo usan sus rutas', async () => {
    const calls = [setup.back('team'), setup.skip('team'), setup.restart()];
    http.expectOne(`${BASE}/back`).flush(view());
    http.expectOne(`${BASE}/skip`).flush(view());
    http.expectOne(`${BASE}/restart`).flush(view());
    await Promise.all(calls);
  });
});
