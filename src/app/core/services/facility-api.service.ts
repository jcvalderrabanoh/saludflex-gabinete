import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActivateObligationInput,
  Catalog,
  ChainVerification,
  Equipment,
  Personnel,
  SubjectResult,
  Establishment,
  EstablishmentInput,
  EstablishmentStatus,
  EvidenceAnalysis,
  EvidenceInput,
  EvidenceRecord,
} from '../models/facility.models';

/** Cliente de la API `facility` de jc-core. */
@Injectable({ providedIn: 'root' })
export class FacilityApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility`;

  establishments(): Observable<Establishment[]> {
    return this.http.get<Establishment[]>(`${this.base}/establishments`);
  }

  createEstablishment(input: EstablishmentInput): Observable<Establishment> {
    return this.http
      .post<{ establishment: Establishment }>(`${this.base}/establishments`, clean(input))
      .pipe(map((r) => r.establishment));
  }

  updateEstablishment(id: string, input: Partial<EstablishmentInput>): Observable<Establishment> {
    return this.http
      .patch<{ establishment: Establishment }>(`${this.base}/establishments/${id}`, clean(input))
      .pipe(map((r) => r.establishment));
  }

  status(establishmentId: string): Observable<EstablishmentStatus> {
    return this.http.get<EstablishmentStatus>(`${this.base}/establishments/${establishmentId}/status`);
  }

  catalog(): Observable<Catalog> {
    return this.http.get<Catalog>(`${this.base}/catalog`);
  }

  activateObligation(establishmentId: string, input: ActivateObligationInput): Observable<unknown> {
    return this.http.post(`${this.base}/establishments/${establishmentId}/obligations`, clean(input));
  }

  deactivateObligation(obligationId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/obligations/${obligationId}`);
  }

  records(obligationId: string): Observable<EvidenceRecord[]> {
    return this.http.get<EvidenceRecord[]>(`${this.base}/obligations/${obligationId}/records`);
  }

  /** OCR + IA: sugiere obligación, fechas y notas con su confianza. No guarda. */
  analyzeEvidence(establishmentId: string, file: File): Observable<EvidenceAnalysis> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<EvidenceAnalysis>(`${this.base}/establishments/${establishmentId}/evidence/analyze`, form);
  }

  recordEvidence(obligationId: string, input: EvidenceInput): Observable<EvidenceRecord> {
    return this.http.post<EvidenceRecord>(`${this.base}/obligations/${obligationId}/records`, toForm(input));
  }

  correctEvidence(recordId: string, input: EvidenceInput): Observable<EvidenceRecord> {
    return this.http.post<EvidenceRecord>(`${this.base}/records/${recordId}/corrections`, toForm(input));
  }

  evidenceFile(recordId: string): Observable<Blob> {
    return this.http.get(`${this.base}/records/${recordId}/file`, { responseType: 'blob' });
  }

  inspectionFolder(establishmentId: string): Observable<Blob> {
    return this.http.get(`${this.base}/establishments/${establishmentId}/inspection-folder`, {
      responseType: 'blob',
    });
  }

  equipment(establishmentId: string): Observable<Equipment[]> {
    return this.http.get<Equipment[]>(`${this.base}/establishments/${establishmentId}/equipment`);
  }

  registerEquipment(establishmentId: string, input: Partial<Equipment>): Observable<SubjectResult<Equipment>> {
    return this.http.post<SubjectResult<Equipment>>(`${this.base}/establishments/${establishmentId}/equipment`, clean(input));
  }

  updateEquipment(id: string, input: Partial<Equipment>): Observable<SubjectResult<Equipment>> {
    return this.http.patch<SubjectResult<Equipment>>(`${this.base}/equipment/${id}`, clean(input));
  }

  retireEquipment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/equipment/${id}`);
  }

  personnel(establishmentId: string): Observable<Personnel[]> {
    return this.http.get<Personnel[]>(`${this.base}/establishments/${establishmentId}/personnel`);
  }

  registerPerson(establishmentId: string, input: Partial<Personnel>): Observable<SubjectResult<Personnel>> {
    return this.http.post<SubjectResult<Personnel>>(`${this.base}/establishments/${establishmentId}/personnel`, clean(input));
  }

  updatePerson(id: string, input: Partial<Personnel>): Observable<SubjectResult<Personnel>> {
    return this.http.patch<SubjectResult<Personnel>>(`${this.base}/personnel/${id}`, clean(input));
  }

  retirePerson(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/personnel/${id}`);
  }

  inspectionPackage(establishmentId: string): Observable<Blob> {
    return this.http.get(`${this.base}/establishments/${establishmentId}/inspection-package`, {
      responseType: 'blob',
    });
  }

  verifyChain(): Observable<ChainVerification> {
    return this.http.get<ChainVerification>(`${this.base}/evidence-chain/verification`);
  }
}

/** Quita vacíos: el backend valida formato en lo que llega, no en cadenas vacías. */
export function clean<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  ) as Partial<T>;
}

export function toForm(input: EvidenceInput): FormData {
  const form = new FormData();
  form.append('performedOn', input.performedOn);
  if (input.validUntil) form.append('validUntil', input.validUntil);
  if (input.notes?.trim()) form.append('notes', input.notes.trim());
  if (input.correctionReason?.trim()) form.append('correctionReason', input.correctionReason.trim());
  if (input.file) form.append('file', input.file, input.file.name);
  return form;
}
