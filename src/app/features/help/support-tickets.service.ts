import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NewTicketInput, NewTicketResult, TicketDetail, TicketSummary } from './help.models';

/** Prefijo del contexto: soporte ya sabe la app por el ticket; esto da la pantalla. */
const CONTEXT_PREFIX = 'Gabinete · ';

/**
 * Reportes de soporte de Gabinete (`/facility/support/tickets`). El backend
 * los marca como de Gabinete por la sesión y solo devuelve los de esta app.
 */
@Injectable({ providedIn: 'root' })
export class SupportTicketsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/support/tickets`;

  mine(): Observable<TicketSummary[]> {
    return this.http.get<TicketSummary[]>(`${this.base}/mine`);
  }

  /** Para el contador de la barra: si falla, cero (no es motivo para romper la pantalla). */
  unreadCount(): Observable<number> {
    return this.http.get<{ count: number }>(`${this.base}/unread-count`).pipe(
      map((r) => r.count ?? 0),
      catchError(() => of(0)),
    );
  }

  detail(id: string): Observable<TicketDetail> {
    return this.http.get<TicketDetail>(`${this.base}/${id}`);
  }

  /** `route`: la pantalla desde la que se reporta (sin datos de pacientes). */
  create(input: NewTicketInput, route: string): Observable<NewTicketResult> {
    return this.http.post<NewTicketResult>(this.base, {
      type: input.type,
      title: input.title.trim(),
      description: input.description.trim(),
      context: `${CONTEXT_PREFIX}${route}`,
    });
  }

  addInfo(id: string, body: string): Observable<TicketDetail> {
    return this.http.post<TicketDetail>(`${this.base}/${id}/messages`, { body: body.trim() });
  }

  close(id: string): Observable<TicketDetail> {
    return this.http.post<TicketDetail>(`${this.base}/${id}/close`, {});
  }
}
