import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SETUP_ANSWER_MAX, SetupCallResult, SetupChoice, SetupStepView } from './help.models';
import { SetupAssistantService } from './setup-assistant.service';

const UNAVAILABLE_REASON: Record<string, string> = {
  no_permission: 'tu usuario no tiene permiso: pídeselo a quien administra tu cuenta.',
  needs_establishment: 'primero da de alta un establecimiento.',
};

/**
 * Configuración guiada de Gabinete dentro del panel de Ayuda. Solo pinta lo
 * que manda jc-core (pregunta, opciones, resumen) y devuelve lo que el
 * usuario responde; jc-core valida, revisa permisos y escribe tras
 * «Confirmar».
 */
@Component({
  selector: 'app-setup-conversation',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  template: `
    <div class="steps" aria-label="Pasos">
      @for (step of steps(); track step.key) {
        <span class="step" [class]="step.status">{{ step.title }}</span>
      }
    </div>
    @for (step of blockedSteps(); track step.key) {
      <p class="hint">«{{ step.title }}»: {{ reasonOf(step) }}</p>
    }

    <div class="body">
      @for (entry of setup.history(); track $index) {
        <div class="bubble" [class.user]="entry.from === 'user'">{{ entry.text }}</div>
      }
      @if (prompt(); as p) {
        <div class="bubble current">
          <p>{{ p.text }}</p>
          @if (p.summary?.length) {
            <dl class="summary">
              @for (line of p.summary; track line.label) {
                <dt>{{ line.label }}</dt>
                <dd>{{ line.value }}</dd>
              }
            </dl>
          }
          @if (p.error || notice()) {
            <p class="error" role="alert">{{ notice() ?? p.error }}</p>
          }
        </div>
      }
      @if (busy()) {
        <div class="busy"><mat-spinner diameter="16" /> Un momento…</div>
      }
    </div>

    @if (prompt(); as p) {
      <footer>
        @switch (p.input) {
          @case ('text') {
            <mat-form-field appearance="outline" class="full">
              <mat-label>Tu respuesta</mat-label>
              <input matInput name="answer" [(ngModel)]="text" [maxlength]="maxLength" (keydown.enter)="sendText()" />
            </mat-form-field>
            <button mat-flat-button color="primary" type="button" [disabled]="busy() || !text.trim()" (click)="sendText()">Enviar</button>
          }
          @case ('choices') {
            <div class="choices">
              @for (choice of p.choices ?? []; track choice.value) {
                <button mat-stroked-button type="button" [disabled]="busy()" (click)="choose(choice)">{{ choice.label }}</button>
              }
            </div>
          }
          @case ('multi_choices') {
            <div class="multi">
              @for (choice of p.choices ?? []; track choice.value) {
                <mat-checkbox [checked]="picked().has(choice.value)" (change)="toggle(choice.value)">{{ choice.label }}</mat-checkbox>
              }
            </div>
            <button mat-flat-button color="primary" type="button" [disabled]="busy() || picked().size === 0" (click)="sendPicked()">Continuar</button>
          }
        }
        @if (p.kind === 'confirm') {
          <div class="row">
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="correct()">Corregir</button>
            <button mat-flat-button color="primary" type="button" [disabled]="busy()" (click)="confirm()">Confirmar</button>
          </div>
        }
        @if (p.kind === 'done') {
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="restart()">Empezar de nuevo</button>
        } @else if (p.step) {
          <button mat-button type="button" class="skip" [disabled]="busy()" (click)="skip()">Omitir este paso</button>
        }
      </footer>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 0; flex: 1; }
    .steps { display: flex; flex-wrap: wrap; gap: 4px; padding: 12px 16px 4px; }
    .step { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: #f1f5f9; color: #526077; }
    .step.in_progress, .step.awaiting_confirm { background: #eef2fb; color: #1e3a8a; font-weight: 600; }
    .step.completed { background: #e7f6ef; color: #08764e; }
    .step.skipped, .step.unavailable { text-decoration: line-through; }
    .hint { margin: 0 16px; font-size: 12px; color: #526077; }
    .body { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
    .bubble { max-width: 92%; padding: 8px 12px; border-radius: 12px; background: #f1f5f9; font-size: 14px; align-self: flex-start; }
    .bubble.user { align-self: flex-end; background: #eef2fb; }
    .bubble p { margin: 0; }
    .summary { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 8px 0 0; font-size: 13px; }
    .summary dt { font-weight: 600; }
    .summary dd { margin: 0; }
    .error { color: #b4232c; font-size: 13px; margin-top: 6px !important; }
    .busy { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #526077; }
    footer { padding: 8px 16px 16px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 8px; }
    .full { width: 100%; }
    .choices, .row { display: flex; flex-wrap: wrap; gap: 6px; }
    .row { justify-content: flex-end; }
    .multi { display: flex; flex-direction: column; }
    .skip { align-self: flex-start; }
  `],
})
export class SetupConversationComponent implements OnInit {
  protected readonly setup = inject(SetupAssistantService);
  readonly maxLength = SETUP_ANSWER_MAX;
  readonly prompt = computed(() => this.setup.view()?.prompt ?? null);
  readonly steps = computed(() => this.setup.view()?.steps ?? []);
  readonly blockedSteps = computed(() => this.steps().filter((s) => s.status === 'unavailable' && s.reason && UNAVAILABLE_REASON[s.reason]));
  readonly busy = signal(false);
  /** Error de la última llamada (red o 409); el de validación viene en el prompt. */
  readonly notice = signal<string | null>(null);
  readonly picked = signal<ReadonlySet<string>>(new Set());
  text = '';

  ngOnInit(): void {
    if (!this.setup.view()) void this.run(() => this.setup.start());
  }

  reasonOf(step: SetupStepView): string {
    return UNAVAILABLE_REASON[step.reason ?? ''] ?? '';
  }

  sendText(): void {
    const value = this.text.trim();
    if (!value || this.busy()) return;
    void this.answer(value, value).then((ok) => ok && (this.text = ''));
  }

  choose(choice: SetupChoice): void {
    void this.answer(choice.value, choice.label);
  }

  toggle(value: string): void {
    this.picked.update((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  sendPicked(): void {
    const chosen = (this.prompt()?.choices ?? []).filter((c) => this.picked().has(c.value));
    const value = chosen.map((c) => c.value).join(',');
    const shown = chosen.map((c) => c.label).join(', ');
    void this.answer(value, shown).then((ok) => ok && this.picked.set(new Set()));
  }

  confirm(): void {
    const p = this.prompt();
    if (p?.step) void this.run(() => this.setup.confirm(p.step!, p.draftVersion));
  }

  correct(): void {
    const step = this.prompt()?.step;
    if (step) void this.run(() => this.setup.back(step));
  }

  skip(): void {
    const step = this.prompt()?.step;
    if (step) void this.run(() => this.setup.skip(step));
  }

  restart(): void {
    void this.run(() => this.setup.restart());
  }

  private answer(value: string, shown: string): Promise<boolean> {
    const p = this.prompt();
    if (!p?.step || !p.field) return Promise.resolve(false);
    return this.run(() => this.setup.answer(p.step!, p.field!, value, shown));
  }

  private async run(call: () => Promise<SetupCallResult>): Promise<boolean> {
    this.busy.set(true);
    this.notice.set(null);
    const result = await call();
    this.busy.set(false);
    if (!result.ok) this.notice.set(result.error);
    return result.ok;
  }
}
