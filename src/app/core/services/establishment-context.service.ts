import { Injectable, computed, signal } from '@angular/core';
import { Establishment } from '../models/facility.models';

const STORAGE_KEY = 'facility.establishmentId';

/** El establecimiento con el que se está trabajando (se recuerda entre visitas). */
@Injectable({ providedIn: 'root' })
export class EstablishmentContextService {
  readonly establishments = signal<Establishment[]>([]);
  private readonly selectedId = signal<string | null>(localStorage.getItem(STORAGE_KEY));

  readonly current = computed<Establishment | null>(() => {
    const list = this.establishments();
    return list.find((e) => e.id === this.selectedId()) ?? list[0] ?? null;
  });

  setEstablishments(list: Establishment[]): void {
    this.establishments.set(list);
  }

  select(id: string): void {
    this.selectedId.set(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  clear(): void {
    this.establishments.set([]);
    this.selectedId.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }
}
