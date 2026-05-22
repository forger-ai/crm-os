// Shared API types mirroring the backend Pydantic schemas in backend/src/app/schemas.py.

export type ActivityKind = "call" | "email" | "meeting" | "task";
export type DealStatus = "open" | "won" | "lost";
export type CustomFieldEntity = "contact" | "organization" | "deal";
export type CustomFieldType = "text" | "number" | "date" | "select" | "bool";

export interface ContactOrganizationLink {
  organization_id: string;
  organization_name: string;
  role: string | null;
  is_primary: boolean;
}

export interface ContactSummary {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  owner: string | null;
  organizations: ContactOrganizationLink[];
}

export interface CustomFieldValueRead {
  field_id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  value: unknown;
}

export interface DealSummary {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id: string;
  stage_name: string;
  organization_id: string | null;
  organization_name: string | null;
  primary_contact_id: string | null;
  primary_contact_name: string | null;
  owner: string | null;
  amount_cents: number;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  status: DealStatus;
  updated_at: string;
}

export interface DealStageHistoryRead {
  id: string;
  from_stage_id: string | null;
  from_stage_name: string | null;
  to_stage_id: string;
  to_stage_name: string;
  note: string | null;
  changed_at: string;
}

export interface ActivityRead {
  id: string;
  kind: ActivityKind;
  subject: string;
  body: string | null;
  due_at: string | null;
  completed_at: string | null;
  deal_id: string | null;
  contact_id: string | null;
  organization_id: string | null;
  owner: string | null;
  external_provider: string | null;
  external_message_id: string | null;
  external_thread_id: string | null;
  from_email: string | null;
  to_email: string | null;
  pending_send: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailSyncStatus {
  provider: "gmail";
  last_synced_at: string | null;
  total_synced: number;
  last_24h: number;
  pending_send_count: number;
}

export interface NoteRead {
  id: string;
  body: string;
  deal_id: string | null;
  contact_id: string | null;
  organization_id: string | null;
  author: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  owner: string | null;
  contacts_count: number;
  open_deals_count: number;
  open_deals_value: Record<string, number>;
}

export interface OrganizationRead {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  owner: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  contacts: ContactSummary[];
  open_deals: DealSummary[];
  custom_fields: CustomFieldValueRead[];
}

export interface ContactRead {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  owner: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  organizations: ContactOrganizationLink[];
  open_deals: DealSummary[];
  custom_fields: CustomFieldValueRead[];
}

export interface DealRead extends DealSummary {
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  description: string | null;
  created_at: string;
  stage_history: DealStageHistoryRead[];
  activities: ActivityRead[];
  notes: NoteRead[];
  custom_fields: CustomFieldValueRead[];
}

export interface PipelineStageRead {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability_default: number;
  is_won: boolean;
  is_lost: boolean;
  color: string;
}

export interface PipelineRead {
  id: string;
  name: string;
  is_default: boolean;
  archived: boolean;
  position: number;
  stages: PipelineStageRead[];
}

export interface CustomFieldDefRead {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  position: number;
  archived: boolean;
}

export interface ImportRunRead {
  id: string;
  source: "contacts" | "organizations";
  filename: string | null;
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  rows_failed: number;
  dry_run: boolean;
  created_at: string;
}

export interface ImportRunDetail extends ImportRunRead {
  errors: Array<Record<string, unknown>>;
}

export interface FieldValueRead {
  scope: string;
  value: string;
  usage_count: number;
  last_used_at: string;
}

export interface PipelineValueByStage {
  stage_id: string;
  stage_name: string;
  deals_count: number;
  by_currency: Record<string, number>;
}

export interface WonLostByMonth {
  month: string;
  won_count: number;
  lost_count: number;
  won_by_currency: Record<string, number>;
  lost_by_currency: Record<string, number>;
}

export interface StageConversionPoint {
  stage_id: string;
  stage_name: string;
  entered: number;
  moved_forward: number;
  conversion_rate: number;
}

export interface ActivitiesOverview {
  overdue: number;
  due_today: number;
  due_this_week: number;
  completed_last_30_days: number;
  upcoming: ActivityRead[];
}

export interface WeeklySummary {
  pipeline_value: Record<string, number>;
  deals_open: number;
  deals_won_this_week: number;
  deals_lost_this_week: number;
  activities: ActivitiesOverview;
  stale_deals: DealSummary[];
}

export interface SearchHit {
  entity: "organization" | "contact" | "deal";
  id: string;
  label: string;
  sublabel: string | null;
}

export interface SearchResults {
  organizations: SearchHit[];
  contacts: SearchHit[];
  deals: SearchHit[];
}

// ── Products ────────────────────────────────────────────────────────────────

export interface ProductRead {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  default_unit_price_cents: number;
  default_currency: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export interface QuoteLineRead {
  id: string;
  quote_id: string;
  position: number;
  product_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_pct: number;
  line_total_cents: number;
}

export interface QuoteSummary {
  id: string;
  deal_id: string;
  number: string;
  title: string;
  status: QuoteStatus;
  currency: string;
  total_cents: number;
  valid_until: string | null;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteRead extends QuoteSummary {
  subtotal_cents: number;
  tax_rate: number;
  tax_cents: number;
  notes: string | null;
  lines: QuoteLineRead[];
}

// ── Lead scoring ────────────────────────────────────────────────────────────

export type LeadBand = "hot" | "warm" | "cold";

export interface LeadScoreFactor {
  key: string;
  label: string;
  contribution: number;
  detail: string;
}

export interface LeadScoreRead {
  deal_id: string;
  score: number;
  band: LeadBand;
  factors: LeadScoreFactor[];
  computed_at: string;
}

export interface LeadScoreEntry {
  deal_id: string;
  deal_title: string;
  score: number;
  band: LeadBand;
  stage_name: string;
  amount_cents: number;
  currency: string;
  owner: string | null;
}

export interface LeadScoreReport {
  hot: LeadScoreEntry[];
  cold: LeadScoreEntry[];
}

// ── Lead intake (Gmail polling) ─────────────────────────────────────────────

export type IntakeMode = "review" | "auto";
export type IncomingLeadStatus = "pending" | "accepted" | "dismissed";

export interface IntakeConfig {
  enabled: boolean;
  mode: IntakeMode;
  poll_interval_minutes: number;
  last_polled_at: string | null;
  since_iso: string;
  pending_count: number;
}

export interface IntakeConfigUpdate {
  enabled?: boolean;
  mode?: IntakeMode;
  poll_interval_minutes?: number;
}

export interface IncomingLead {
  id: string;
  external_provider: string;
  external_message_id: string;
  external_thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body: string | null;
  received_at: string | null;
  confidence: number;
  reason: string | null;
  suggested_first_name: string | null;
  suggested_last_name: string | null;
  suggested_org_name: string | null;
  suggested_phone: string | null;
  status: IncomingLeadStatus;
  created_contact_id: string | null;
  created_deal_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadAcceptPayload {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  organization_name?: string | null;
}
