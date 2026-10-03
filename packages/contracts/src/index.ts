export type ProjectStatus =
  'draft' | 'in_review' | 'changes_requested' | 'approved' | 'delivered' | 'archived';
export type AgentStatus =
  'idle' | 'pending' | 'running' | 'failed' | 'agent_configuration_required';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected';
export type MaintenanceStatus = 'active' | 'paused' | 'ended';
export interface User {
  id: string;
  email: string | null;
  role: 'client' | 'professional';
  hasAiApiKey: boolean;
}
export interface Requirement {
  id: string;
  description: string;
  type: 'functional' | 'rule' | 'data' | 'integration' | 'nonfunctional';
  priority: 'must' | 'should';
  source: string;
  sourceMessageId: string;
  systemNote: string;
}
export interface Question {
  id: string;
  question: string;
  reason: string;
  blocksEstimate: boolean;
}
export interface Risk {
  id: string;
  description: string;
  impact: string;
  mitigation: string;
  severity: 'red' | 'yellow' | 'green';
}
export interface Estimate {
  module: string;
  minHours: number;
  maxHours: number;
  uncertainty: string;
}
export interface BriefData {
  summary: string;
  requirements: Requirement[];
  questions: Question[];
  risks: Risk[];
  included: string[];
  excluded: string[];
  assumptions: string[];
  acceptanceCriteria: string[];
  estimates: Estimate[];
  nextSteps: string[];
}
export interface TiptapNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: TiptapNode[];
}
export interface Brief {
  version: number;
  data: BriefData;
  updatedAt: string;
}
export interface DocumentData {
  projectName: string;
  clientName: string;
  author: string;
  date: string;
  version: number;
  brief: BriefData;
  editorContent: TiptapNode | null;
}
export interface DocumentVersion {
  id: string;
  version: number;
  briefVersion: number;
  status: string;
  editorContent: TiptapNode | null;
  createdAt: string;
  formats: ('md' | 'pdf' | 'docx')[];
}
export interface Project {
  id: string;
  name: string;
  clientEmail: string | null;
  status: ProjectStatus;
  agentStatus: AgentStatus;
  createdAt: string;
  updatedAt: string;
  clientUrl?: string;
  brief?: Brief;
  document?: DocumentVersion | null;
}
export interface Message {
  id: string;
  projectId: string;
  authorRole: string;
  content: string;
  createdAt: string;
  files?: FileAsset[];
}
export interface FileAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}
export interface ProjectState {
  briefVersion: number;
  documentVersion: number;
  agentStatus: AgentStatus;
  pendingQuestions: Question[];
  updatedAt: string;
  status: ProjectStatus;
}
export interface RateCard {
  id: string;
  ownerId: string;
  label: string;
  hourlyRate: number;
  currency: string;
  marginPercent: number;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface QuoteLine {
  id: string;
  quoteId: string;
  module: string;
  minHours: number;
  maxHours: number;
  hourlyRate: number;
  priceMin: number;
  priceMax: number;
  position: number;
}
export interface QuoteMilestone {
  id: string;
  quoteId: string;
  name: string;
  percent: number | null;
  amount: number | null;
  position: number;
}
export interface Quote {
  id: string;
  projectId: string;
  status: QuoteStatus;
  currency: string;
  subtotalMin: number;
  subtotalMax: number;
  totalMin: number;
  totalMax: number;
  validUntil: string | null;
  terms: string | null;
  rateCardSnapshot: unknown;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: QuoteLine[];
  milestones?: QuoteMilestone[];
}
export interface MaintenanceEntry {
  id: string;
  agreementId: string;
  changeRequestId: string | null;
  date: string;
  hours: number;
  extraHours: number;
  description: string;
  billableExtra: boolean;
  createdAt: string;
}
export interface MaintenanceAgreement {
  id: string;
  projectId: string;
  status: MaintenanceStatus;
  hoursPerMonth: number;
  monthlyPrice: number | null;
  currency: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  entries?: MaintenanceEntry[];
}
export interface MaintenanceMonth {
  month: string;
  entries: MaintenanceEntry[];
}
export interface MaintenanceBalance {
  month: string;
  hoursPerMonth: number;
  consumedRetainer: number;
  consumedExtra: number;
  remaining: number;
  entriesCount: number;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export type ApiResponse<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: string; message: string; details: unknown; requestId: string };
    };
export const emptyBrief = (): BriefData => ({
  summary: '',
  requirements: [],
  questions: [],
  risks: [],
  included: [],
  excluded: [],
  assumptions: [],
  acceptanceCriteria: [],
  estimates: [],
  nextSteps: [],
});
