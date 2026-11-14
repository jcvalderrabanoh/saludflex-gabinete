import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SetupCallResult, SetupHistoryEntry, SetupSessionView, SetupStepKey } from './help.models';

const HTTP_CONFLICT = 409;
const NETWORK_ERROR = 'No pudimos conectar. Intenta de nuevo en un momento.';
const CONFIRMED = 'Confirmar';
const STALE_ERROR = 'Esa confirmación ya no está vigente. Revisa el resumen y vuelve a confirmar.';

/**
 * Cliente de la configuración guiada de Gabinete. El backend decide pasos,
 * permisos, validación y escrituras; aquí solo se manda lo que el usuario
 * respondió y se guarda la última vista. El historial visible vive en este
 * servicio (raíz) para sobrevivir a cerrar el panel.
 */
@Injectable({ providedIn: 'root' })
export class SetupAssistantService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/setup-assistant/session`;
  private readonly viewSignal = signal<SetupSessionView | null>(null);
  private readonly historySignal = signal<SetupHistoryEntry[]>([]);
  readonly view = this.viewSignal.asReadonly();
  readonly history = this.historySignal.asReadonly();

  refresh(): Promise<SetupCallResult> {
    return this.call(this.http.get<SetupSessionView>(this.base));
  }

  start(step?: SetupStepKey): Promise<SetupCallResult> {
    return this.call(this.http.post<SetupSessionView>(this.base, step ? { step } : {}));
  }

  /** `shown` es lo que el usuario eligió tal como lo vio (la etiqueta, no el valor). */
  answer(step: SetupStepKey, field: string, value: string, shown: string): Promise<SetupCallResult> {
    return this.call(this.http.post<SetupSessionView>(`${this.base}/answer`, { step, field, value }), shown);
  }

  /** Queda en el historial como «Confirmar» para que el resumen no desaparezca sin rastro. */
  confirm(step: SetupStepKey, draftVersion: number): Promise<SetupCallResult> {
    return this.call(this.http.post<SetupSessionView>(`${this.base}/confirm`, { step, draftVersion }), CONFIRMED);
  }

  skip(step: SetupStepKey): Promise<SetupCallResult> {
    return this.call(this.http.post<SetupSessionView>(`${this.base}/skip`, { step }));
  }

  back(step: SetupStepKey): Promise<SetupCallResult> {
    return this.call(this.http.post<SetupSessionView>(`${this.base}/back`, { step }));
  }

  restart(): Promise<SetupCallResult> {
    this.historySignal.set([]);
    return this.call(this.http.post<SetupSessionView>(`${this.base}/restart`, {}));
  }

  private async call(request: Observable<SetupSessionView>, shown?: string): Promise<SetupCallResult> {
    const asked = this.viewSignal()?.prompt?.text;
    try {
      const next = await firstValueFrom(request);
      if (shown !== undefined) this.remember(asked, shown);
      this.viewSignal.set(next);
      return { ok: true };
    } catch (error) {
      return this.fail(error);
    }
  }

  /** 409: otra pestaña o un cambio de permisos movió la sesión; se recarga antes de seguir. */
  private async fail(error: unknown): Promise<SetupCallResult> {
    if (error instanceof HttpErrorResponse && error.status === HTTP_CONFLICT) {
      const message = typeof error.error?.message === 'string' ? error.error.message : STALE_ERROR;
      await this.refresh();
      return { ok: false, error: message };
    }
    return { ok: false, error: NETWORK_ERROR };
  }

  private remember(asked: string | undefined, shown: string): void {
    const entries: SetupHistoryEntry[] = asked ? [{ from: 'bot', text: asked }] : [];
    this.historySignal.update((history) => [...history, ...entries, { from: 'user', text: shown }]);
  }
}
