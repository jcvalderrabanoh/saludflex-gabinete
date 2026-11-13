import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AgendaDay } from '../models/agenda.models';

/** Cliente de la agenda de estudios: API `scheduling` de jc-core. */
@Injectable({ providedIn: 'root' })
export class AgendaApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/scheduling`;

  /** La agenda se enciende por cuenta. Si la consulta falla, se trata como apagada. */
  enabled(): Observable<boolean> {
    return this.http.get<{ enabled: boolean }>(`${this.base}/availability`).pipe(
      map((r) => r.enabled),
      catchError(() => of(false)),
    );
  }

  /** Un día: cada equipo de la cuenta con su horario, bloqueos y citas. */
  day(date: string): Observable<AgendaDay> {
    return this.http.get<AgendaDay>(`${this.base}/day`, { params: { date } });
  }
}
