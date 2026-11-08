import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  InventoryCatalog,
  InventoryCountInput,
  InventoryItem,
  InventoryItemInput,
  InventoryMovementInput,
  InventoryOrder,
  InventoryOrderInput,
  InventoryOrderSuggestion,
  InventoryOverviewRow,
  InventoryServiceOptions,
  InventorySupplier,
  InventoryTask,
  InventoryTaskInput,
  ExportFormat,
  ActivateObligationInput,
  ConnectedApp,
  MarkPaidInput,
  RecurringPayment,
  RecurringPaymentInput,
  RecurringPaymentsOverview,
  Appointment,
  AppointmentInput,
  AppointmentUpdate,
  DateRange,
  Catalog,
  ChainVerification,
  Equipment,
  PaymentWindow,
  Personnel,
  SubjectResult,
  Establishment,
  EstablishmentInput,
  EstablishmentStatus,
  EvidenceAnalysis,
  FacilityDocument,
  LinkDocumentInput,
  EvidenceInput,
  EvidenceRecord,
  InviteMemberInput,
  InviteMemberResult,
  ResendInvitationResult,
  TeamMember,
  TeamPreset,
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

  /** Semáforo y «Hoy». Con `mine`, solo lo de las obligaciones donde el usuario es responsable. */
  status(establishmentId: string, options: { mine?: boolean } = {}): Observable<EstablishmentStatus> {
    const params = options.mine ? new HttpParams().set('mine', 'true') : undefined;
    return this.http.get<EstablishmentStatus>(`${this.base}/establishments/${establishmentId}/status`, { params });
  }

  catalog(): Observable<Catalog> {
    return this.http.get<Catalog>(`${this.base}/catalog`);
  }

  activateObligation(establishmentId: string, input: ActivateObligationInput): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/establishments/${establishmentId}/obligations`, clean(input));
  }

  /** Reemplaza los responsables de la obligación (el backend valida cuenta y permiso de captura). */
  setResponsibles(obligationId: string, responsibleUserIds: string[]): Observable<unknown> {
    return this.http.patch(`${this.base}/obligations/${obligationId}`, { responsibleUserIds });
  }

  /** Pone el plazo de pago (A a B) de la obligación; `null` lo quita. */
  setPaymentWindow(obligationId: string, window: PaymentWindow | null): Observable<unknown> {
    return this.http.patch(`${this.base}/obligations/${obligationId}`, {
      windowStartsOn: window?.startsOn ?? null,
      windowEndsOn: window?.endsOn ?? null,
    });
  }

  deactivateObligation(obligationId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/obligations/${obligationId}`);
  }

  records(obligationId: string): Observable<EvidenceRecord[]> {
    return this.http.get<EvidenceRecord[]>(`${this.base}/obligations/${obligationId}/records`);
  }

  /** Sube UN archivo a la bandeja; la IA lo lee en segundo plano. */
  uploadDocument(establishmentId: string, file: File): Observable<{ document: FacilityDocument; duplicate: boolean }> {
    const form = new FormData();
    form.append('noPatientData', 'true');
    form.append('file', file, file.name);
    return this.http.post<{ document: FacilityDocument; duplicate: boolean }>(
      `${this.base}/establishments/${establishmentId}/documents`,
      form,
    );
  }

  documents(establishmentId: string): Observable<FacilityDocument[]> {
    return this.http.get<FacilityDocument[]>(`${this.base}/establishments/${establishmentId}/documents`);
  }

  linkDocument(documentId: string, input: LinkDocumentInput): Observable<FacilityDocument> {
    return this.http.post<FacilityDocument>(`${this.base}/documents/${documentId}/link`, clean(input));
  }

  discardDocument(documentId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/documents/${documentId}/discard`, {});
  }

  retryDocument(documentId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/documents/${documentId}/retry`, {});
  }

  documentFile(documentId: string): Observable<Blob> {
    return this.http.get(`${this.base}/documents/${documentId}/file`, { responseType: 'blob' });
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

  team(): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(`${this.base}/team`);
  }

  inviteTeamMember(input: InviteMemberInput): Observable<InviteMemberResult> {
    return this.http.post<InviteMemberResult>(`${this.base}/team/invitations`, input);
  }

  resendInvitation(userId: string): Observable<ResendInvitationResult> {
    return this.http.post<ResendInvitationResult>(`${this.base}/team/${userId}/resend`, {});
  }

  changePreset(userId: string, preset: TeamPreset): Observable<void> {
    return this.http.patch<void>(`${this.base}/team/${userId}`, { preset });
  }

  /** Baja del gabinete: quita sus permisos `facility.*` y lo saca de los responsables. */
  removeTeamMember(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/team/${userId}`);
  }

  /** Obligaciones, equipos, personal e historial: Excel o un ZIP con un CSV por listado. */
  exportLists(establishmentId: string, format: ExportFormat): Observable<Blob> {
    return this.http.get(`${this.base}/establishments/${establishmentId}/export`, {
      params: { format },
      responseType: 'blob',
    });
  }

  appointments(establishmentId: string, range: DateRange): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(`${this.base}/establishments/${establishmentId}/appointments`, {
      params: new HttpParams({ fromObject: { ...range } }),
    });
  }

  scheduleAppointment(establishmentId: string, input: AppointmentInput): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.base}/establishments/${establishmentId}/appointments`, clean(input));
  }

  updateAppointment(id: string, input: AppointmentUpdate): Observable<Appointment> {
    // A diferencia de `clean`, conserva `null`: así se borra la hora, el lugar o la obligación.
    const body = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    return this.http.patch<Appointment>(`${this.base}/appointments/${id}`, body);
  }

  cancelAppointment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/appointments/${id}`);
  }

  verifyChain(): Observable<ChainVerification> {
    return this.http.get<ChainVerification>(`${this.base}/evidence-chain/verification`);
  }

  recurringPayments(establishmentId: string): Observable<RecurringPaymentsOverview> {
    return this.http.get<RecurringPaymentsOverview>(`${this.base}/establishments/${establishmentId}/recurring-payments`);
  }

  createRecurringPayment(establishmentId: string, input: RecurringPaymentInput): Observable<RecurringPayment> {
    return this.http.post<RecurringPayment>(`${this.base}/establishments/${establishmentId}/recurring-payments`, input);
  }

  /** Sin `clean`: `amountCents: null` es la forma de borrar el monto. */
  updateRecurringPayment(id: string, input: Partial<RecurringPaymentInput>): Observable<RecurringPayment> {
    return this.http.patch<RecurringPayment>(`${this.base}/recurring-payments/${id}`, input);
  }

  deleteRecurringPayment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/recurring-payments/${id}`);
  }

  markPaymentPaid(id: string, input: MarkPaidInput): Observable<void> {
    return this.http.post<void>(`${this.base}/recurring-payments/${id}/paid`, input);
  }

  unmarkPaymentPaid(id: string, dueOn: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/recurring-payments/${id}/paid/${dueOn}`);
  }

  inventoryOverview(establishmentId: string): Observable<{ items: InventoryOverviewRow[] }> {
    return this.http.get<{ items: InventoryOverviewRow[] }>(`${this.base}/establishments/${establishmentId}/inventory`);
  }

  inventoryCatalog(establishmentId: string): Observable<InventoryCatalog> {
    return this.http.get<InventoryCatalog>(`${this.base}/establishments/${establishmentId}/inventory/catalog`);
  }

  inventoryServiceOptions(establishmentId: string): Observable<InventoryServiceOptions> {
    return this.http.get<InventoryServiceOptions>(`${this.base}/establishments/${establishmentId}/inventory/service-options`);
  }

  createInventorySupplier(establishmentId: string, input: { name: string; contact?: string }): Observable<InventorySupplier> {
    return this.http.post<InventorySupplier>(`${this.base}/establishments/${establishmentId}/inventory/suppliers`, input);
  }

  createInventoryItem(establishmentId: string, input: InventoryItemInput): Observable<InventoryItem> {
    return this.http.post<InventoryItem>(`${this.base}/establishments/${establishmentId}/inventory/items`, input);
  }

  updateInventoryItem(id: string, input: Partial<InventoryItemInput>): Observable<InventoryItem> {
    return this.http.patch<InventoryItem>(`${this.base}/inventory/items/${id}`, input);
  }

  deleteInventoryItem(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/inventory/items/${id}`);
  }

  createInventoryTask(establishmentId: string, input: InventoryTaskInput): Observable<InventoryTask> {
    return this.http.post<InventoryTask>(`${this.base}/establishments/${establishmentId}/inventory/tasks`, input);
  }

  updateInventoryTask(id: string, input: InventoryTaskInput): Observable<InventoryTask> {
    return this.http.put<InventoryTask>(`${this.base}/inventory/tasks/${id}`, input);
  }

  deleteInventoryTask(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/inventory/tasks/${id}`);
  }

  recordInventoryMovement(establishmentId: string, input: InventoryMovementInput): Observable<void> {
    return this.http.post<void>(`${this.base}/establishments/${establishmentId}/inventory/movements`, input);
  }

  countInventory(establishmentId: string, input: InventoryCountInput): Observable<void> {
    return this.http.post<void>(`${this.base}/establishments/${establishmentId}/inventory/counts`, input);
  }

  inventoryOrderSuggestions(establishmentId: string): Observable<InventoryOrderSuggestion[]> {
    return this.http.get<InventoryOrderSuggestion[]>(`${this.base}/establishments/${establishmentId}/inventory/order-suggestions`);
  }

  inventoryOrders(establishmentId: string): Observable<InventoryOrder[]> {
    return this.http.get<InventoryOrder[]>(`${this.base}/establishments/${establishmentId}/inventory/orders`);
  }

  createInventoryOrder(establishmentId: string, input: InventoryOrderInput): Observable<InventoryOrder> {
    return this.http.post<InventoryOrder>(`${this.base}/establishments/${establishmentId}/inventory/orders`, input);
  }

  approveInventoryOrder(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/inventory/orders/${id}/approve`, {});
  }

  receiveInventoryOrder(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/inventory/orders/${id}/receive`, {});
  }

  cancelInventoryOrder(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/inventory/orders/${id}/cancel`, {});
  }

  connectedApps(): Observable<ConnectedApp[]> {
    return this.http.get<ConnectedApp[]>(`${this.base}/connected-apps`);
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
