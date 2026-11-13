import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AgendaAppointment,
  AgendaBlock,
  AgendaBlockInput,
  AgendaResource,
  AgendaServiceTypeInput,
  AgendaWeekHour,
  AgendaBooked,
  AgendaBooking,
  AgendaContact,
  AgendaDay,
  AgendaReschedule,
  AgendaServiceType,
  AgendaSlots,
  AgendaSlotsQuery,
} from '../models/agenda.models';

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

  serviceTypes(): Observable<AgendaServiceType[]> {
    return this.http.get<AgendaServiceType[]>(`${this.base}/service-types`);
  }

  /** Horas libres de un equipo ese día para un servicio; no incluye las que ya empezaron. */
  slots(query: AgendaSlotsQuery): Observable<AgendaSlots> {
    const { durationMinutes, ...rest } = query;
    return this.http.get<AgendaSlots>(`${this.base}/slots`, { params: durationMinutes ? { ...rest, durationMinutes } : rest });
  }

  /** Contactos de paciente por parte del nombre o del teléfono (mínimo 2 caracteres). */
  contacts(q: string): Observable<AgendaContact[]> {
    return this.http.get<AgendaContact[]>(`${this.base}/contacts`, { params: { q } });
  }

  /** 409 si el equipo está ocupado o bloqueado en ese lapso (`AgendaConflict`). */
  book(booking: AgendaBooking): Observable<AgendaBooked> {
    return this.http.post<AgendaBooked>(`${this.base}/appointments`, booking);
  }

  reschedule(id: string, change: AgendaReschedule): Observable<AgendaBooked> {
    return this.http.post<AgendaBooked>(`${this.base}/appointments/${id}/reschedule`, change);
  }

  arrive(id: string): Observable<AgendaAppointment> {
    return this.http.post<AgendaAppointment>(`${this.base}/appointments/${id}/arrive`, {});
  }

  attend(id: string): Observable<AgendaAppointment> {
    return this.http.post<AgendaAppointment>(`${this.base}/appointments/${id}/attend`, {});
  }

  noShow(id: string): Observable<AgendaAppointment> {
    return this.http.post<AgendaAppointment>(`${this.base}/appointments/${id}/no-show`, {});
  }

  cancel(id: string, reason: string | null): Observable<AgendaAppointment> {
    return this.http.post<AgendaAppointment>(`${this.base}/appointments/${id}/cancel`, reason ? { reason } : {});
  }

  // Configuración: pide `facility.schedule.configure`.

  createServiceType(input: AgendaServiceTypeInput): Observable<AgendaServiceType> {
    return this.http.post<AgendaServiceType>(`${this.base}/service-types`, input);
  }

  updateServiceType(id: string, input: AgendaServiceTypeInput): Observable<AgendaServiceType> {
    return this.http.patch<AgendaServiceType>(`${this.base}/service-types/${id}`, input);
  }

  removeServiceType(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/service-types/${id}`);
  }

  /** Los equipos de la cuenta con su horario semanal. */
  resources(): Observable<AgendaResource[]> {
    return this.http.get<AgendaResource[]>(`${this.base}/resources`);
  }

  /** Reemplaza el horario semanal completo del equipo. */
  replaceHours(equipmentId: string, hours: AgendaWeekHour[]): Observable<AgendaWeekHour[]> {
    return this.http.put<AgendaWeekHour[]>(`${this.base}/resources/${equipmentId}/hours`, { hours });
  }

  /** Bloqueos del equipo que aún no terminan. */
  blocks(equipmentId: string): Observable<AgendaBlock[]> {
    return this.http.get<AgendaBlock[]>(`${this.base}/resources/${equipmentId}/blocks`);
  }

  createBlock(equipmentId: string, input: AgendaBlockInput): Observable<AgendaBlock> {
    return this.http.post<AgendaBlock>(`${this.base}/resources/${equipmentId}/blocks`, input);
  }

  removeBlock(equipmentId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/resources/${equipmentId}/blocks/${id}`);
  }
}
