import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SetupHistoryEntry, SetupPrompt, SetupSessionView } from './help.models';
import { SetupAssistantService } from './setup-assistant.service';
import { SetupConversationComponent } from './setup-conversation.component';

function sessionWith(prompt: Partial<SetupPrompt> | null): SetupSessionView {
  return {
    status: prompt ? 'active' : 'not_started',
    currentStep: 'establishment',
    steps: [
      { key: 'establishment', title: 'Establecimiento', status: 'in_progress' },
      { key: 'team', title: 'Invitar al equipo', status: 'unavailable', reason: 'no_permission' },
    ],
    prompt: prompt ? { kind: 'question', step: 'establishment', field: 'establishmentName', text: '¿Cómo se llama?', input: 'text', draftVersion: 3, ...prompt } : null,
  };
}

describe('Configuración guiada (conversación)', () => {
  const ok = Promise.resolve({ ok: true as const });
  let fake: {
    view: ReturnType<typeof signal<SetupSessionView | null>>;
    history: ReturnType<typeof signal<SetupHistoryEntry[]>>;
    start: jasmine.Spy;
    answer: jasmine.Spy;
    confirm: jasmine.Spy;
    back: jasmine.Spy;
    skip: jasmine.Spy;
    restart: jasmine.Spy;
  };

  function render(prompt: Partial<SetupPrompt> | null) {
    fake.view.set(sessionWith(prompt));
    const fixture = TestBed.createComponent(SetupConversationComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const button = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text);

  beforeEach(() => {
    fake = {
      view: signal<SetupSessionView | null>(null),
      history: signal<SetupHistoryEntry[]>([]),
      start: jasmine.createSpy('start').and.returnValue(ok),
      answer: jasmine.createSpy('answer').and.returnValue(ok),
      confirm: jasmine.createSpy('confirm').and.returnValue(ok),
      back: jasmine.createSpy('back').and.returnValue(ok),
      skip: jasmine.createSpy('skip').and.returnValue(ok),
      restart: jasmine.createSpy('restart').and.returnValue(ok),
    };
    TestBed.configureTestingModule({ imports: [SetupConversationComponent], providers: [{ provide: SetupAssistantService, useValue: fake }] });
  });

  it('si no ha empezado, arranca la conversación', () => {
    fake.view.set(null);
    TestBed.createComponent(SetupConversationComponent).detectChanges();
    expect(fake.start).toHaveBeenCalled();
  });

  it('muestra los pasos y explica por qué uno no está disponible', () => {
    const { el } = render({});
    expect(el.textContent).toContain('Establecimiento');
    expect(el.textContent).toContain('Invitar al equipo');
    expect(el.textContent).toContain('pídeselo a quien administra');
  });

  it('una pregunta de texto se responde con «Enviar»', () => {
    const { fixture, el } = render({});
    const input = el.querySelector<HTMLInputElement>('input[name="answer"]')!;
    input.value = 'Matriz Centro';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button(el, 'Enviar')!.click();
    expect(fake.answer).toHaveBeenCalledWith('establishment', 'establishmentName', 'Matriz Centro', 'Matriz Centro');
  });

  it('una opción se manda con su valor y queda en el historial con su etiqueta', () => {
    const { el } = render({ field: 'establishmentType', input: 'choices', choices: [{ value: 'gabinete-imagen', label: 'Gabinete de imagen' }] });
    button(el, 'Gabinete de imagen')!.click();
    expect(fake.answer).toHaveBeenCalledWith('establishment', 'establishmentType', 'gabinete-imagen', 'Gabinete de imagen');
  });

  it('opción múltiple: se marcan varias y se mandan juntas', () => {
    const { fixture, el } = render({
      field: 'services',
      input: 'multi_choices',
      choices: [
        { value: 'xray', label: 'Rayos X' },
        { value: 'ultrasound', label: 'Ultrasonido' },
        { value: 'ct', label: 'Tomografía' },
      ],
    });
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    boxes[0].click();
    boxes[1].click();
    fixture.detectChanges();
    button(el, 'Continuar')!.click();
    expect(fake.answer).toHaveBeenCalledWith('establishment', 'services', 'xray,ultrasound', 'Rayos X, Ultrasonido');
  });

  it('«Continuar» no se puede pulsar sin marcar nada', () => {
    const { el } = render({ field: 'services', input: 'multi_choices', choices: [{ value: 'xray', label: 'Rayos X' }] });
    expect(button(el, 'Continuar')!.disabled).toBeTrue();
  });

  it('la confirmación muestra el resumen y confirma con la versión que se ve', () => {
    const { el } = render({ kind: 'confirm', field: 'confirm', input: 'none', text: 'Voy a guardar esto. ¿Confirmas?', summary: [{ label: 'Nombre', value: 'Matriz' }] });
    expect(el.textContent).toContain('Nombre');
    expect(el.textContent).toContain('Matriz');
    button(el, 'Confirmar')!.click();
    expect(fake.confirm).toHaveBeenCalledWith('establishment', 3);
  });

  it('«Corregir» vuelve al principio del paso', () => {
    const { el } = render({ kind: 'confirm', field: 'confirm', input: 'none', summary: [] });
    button(el, 'Corregir')!.click();
    expect(fake.back).toHaveBeenCalledWith('establishment');
  });

  it('el error del backend se anuncia', () => {
    const { el } = render({ error: 'Es demasiado corto.' });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Es demasiado corto.');
  });

  it('se puede omitir el paso actual', () => {
    const { el } = render({});
    button(el, 'Omitir este paso')!.click();
    expect(fake.skip).toHaveBeenCalledWith('establishment');
  });

  it('al terminar no pide respuesta y ofrece empezar de nuevo', () => {
    const { el } = render({ kind: 'done', step: null, field: null, input: 'none', text: 'Listo.' });
    expect(el.querySelector('input[name="answer"]')).toBeNull();
    expect(button(el, 'Omitir este paso')).toBeUndefined();
    expect(button(el, 'Empezar de nuevo')).toBeDefined();
  });
});
