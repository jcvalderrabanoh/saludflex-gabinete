/**
 * Contratos de la ayuda de Gabinete con jc-core:
 * configuración guiada (`/facility/setup-assistant/session`) y reportes de
 * soporte (`/facility/support/tickets`). Todo texto que ve el usuario en la
 * conversación lo manda el backend.
 */

export type SetupStepKey = 'establishment' | 'team' | 'equipment' | 'personnel';
export type SetupStepStatus = 'pending' | 'in_progress' | 'awaiting_confirm' | 'completed' | 'skipped' | 'unavailable';
export type SetupStepReason = 'user' | 'no_permission' | 'already_done' | 'needs_establishment';
export type SetupInput = 'text' | 'choices' | 'multi_choices' | 'none';
export type SetupPromptKind = 'question' | 'confirm' | 'done';

export interface SetupChoice {
  value: string;
  label: string;
}

export interface SetupSummaryLine {
  label: string;
  value: string;
}

export interface SetupPrompt {
  kind: SetupPromptKind;
  step: SetupStepKey | null;
  field: string | null;
  text: string;
  input: SetupInput;
  choices?: SetupChoice[];
  summary?: SetupSummaryLine[];
  draftVersion: number;
  error?: string;
}

export interface SetupStepView {
  key: SetupStepKey;
  title: string;
  status: SetupStepStatus;
  reason?: SetupStepReason;
}

export interface SetupSessionView {
  status: 'not_started' | 'active' | 'completed';
  currentStep: SetupStepKey | null;
  steps: SetupStepView[];
  prompt: SetupPrompt | null;
}

/** Lo que se pinta en el historial de la conversación (solo en memoria). */
export interface SetupHistoryEntry {
  from: 'bot' | 'user';
  text: string;
}

export type SetupCallResult = { ok: true } | { ok: false; error: string };

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'auto_resolved' | 'closed';
/** Lo único que el usuario puede declarar al reportar. */
export type TicketType = 'bug' | 'support';

export interface TicketSummary {
  id: string;
  title: string;
  status: TicketStatus;
  type: TicketType | string;
  createdAt: string;
  unread: boolean;
  isMine: boolean;
  reporterEmail: string | null;
  followUpOfTicketId: string | null;
}

export interface TicketMessage {
  id: string;
  author: 'reporter' | 'account_admin' | 'support';
  kind: 'comment' | 'closed' | 'reopened' | 'resolved' | 'in_progress';
  body: string | null;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  reportText: string;
  resolvedAt: string | null;
  canAddInfo: boolean;
  canClose: boolean;
  canReopen: boolean;
  reopenUntil: string | null;
  reopenCreatesFollowUp: boolean;
  messages: TicketMessage[];
}

export interface NewTicketInput {
  type: TicketType;
  title: string;
  description: string;
}

export interface NewTicketResult {
  success: boolean;
  ticketId: string | null;
  error: string | null;
}

/** Topes de `CreateSupportTicketDto` / `SupportTicketCommentDto` en jc-core. */
export const TICKET_TITLE_MAX = 140;
export const TICKET_DESCRIPTION_MAX = 5000;
export const TICKET_MESSAGE_MAX = 2000;
export const SETUP_ANSWER_MAX = 255;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Abierto',
  in_progress: 'En revisión',
  resolved: 'Resuelto',
  auto_resolved: 'Resuelto',
  closed: 'Cerrado',
};
