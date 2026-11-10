export type AuthUser = {
  id: string;
  phone: string;
  display_name: string;
  email: string | null;
  phone_verified_at: string | null;
  created_at: string;
};

type ErrorDetail = { code?: string; message?: string; [key: string]: unknown };

export class ApiError extends Error {
  status: number;
  code: string;
  detail: ErrorDetail;

  constructor(status: number, detail: ErrorDetail) {
    super(detail.message ?? "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = detail.code ?? "request_failed";
    this.detail = detail;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let payload: { detail?: ErrorDetail | unknown } = {};
    try { payload = await response.json(); } catch { /* response intentionally sanitized */ }
    const detail = payload.detail && !Array.isArray(payload.detail) && typeof payload.detail === "object"
      ? payload.detail as ErrorDetail
      : { code: "request_failed", message: response.statusText || "Request failed" };
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type OtpRequestResult = {
  status: "accepted";
  expires_in_seconds: number;
  resend_after_seconds: number;
  development_otp?: string;
};

export type VerifyOtpResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "profile_required"; user: null };

export function requestOtp(phone: string) {
  return apiRequest<OtpRequestResult>("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp(phone: string, otp: string) {
  return apiRequest<VerifyOtpResult>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, otp }),
  });
}

export async function completeProfile(displayName: string) {
  const result = await apiRequest<{ status: "authenticated"; user: AuthUser }>("/auth/complete-profile", {
    method: "POST",
    body: JSON.stringify({ display_name: displayName }),
  });
  return result.user;
}

export function getCurrentUser() {
  return apiRequest<AuthUser>("/auth/me");
}

export function updateCurrentUser(changes: { display_name?: string; email?: string | null }) {
  return apiRequest<AuthUser>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function logoutCurrentSession() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export type BrokerProviderApi = { id: string; name: string; short: string; monogram: string; connection_available: boolean; data_mode: "SIMULATED" | "UNAVAILABLE" };
export type BrokerAccountApi = { id: string; provider: string; display_name: string; status: "connected" | "syncing" | "error" | "expired" | "disconnected"; last_synced_at: string | null; position_count: number; account_metadata: Record<string, unknown>; data_mode: "SIMULATED" };
export type SyncResultApi = { broker_account_id: string; status: "completed"; open_positions: number; closed_positions: number; snapshots_created: number; synced_at: string; data_mode: "SIMULATED" };
export type PositionApi = {
  id: string; broker_account_id: string; broker_provider: string; broker_display_name: string; broker_status: string; data_mode: "SIMULATED";
  symbol: string; trading_symbol: string; exchange: string; kind: "option" | "future" | "stock"; side: "BUY" | "SELL"; product: "MIS" | "NRML" | "CNC"; status: "open" | "closed";
  quantity: string; net_quantity: string; available_quantity: string; lot_size: string; average_entry_price: string; ltp: string;
  previous_close: string | null; day_open: string | null; day_low: string | null; day_high: string | null;
  realized_pnl: string; unrealized_pnl: string; mtm: string; gross_exposure: string; pnl_percentage: string; margin_used: string; margin_available: string;
  expiry_date: string | null; greeks: Record<string, unknown>; opened_at: string; closed_at: string | null; last_synced_at: string | null; stale: boolean; exit_method: string | null;
};
export type PositionListApi = { items: PositionApi[]; summary: { position_count: number; gross_exposure: string; realized_pnl: string; unrealized_pnl: string; mtm: string; profitable_count: number; losing_count: number }; last_synced_at: string | null };
export type PositionDetailApi = { position: PositionApi; activity: Array<{ id: string; event_type: string; summary: string; impact_amount: string | null; occurred_at: string; metadata: Record<string, unknown> }> };

export const getBrokerProviders = () => apiRequest<BrokerProviderApi[]>("/brokers/providers");
export const getBrokerAccounts = () => apiRequest<BrokerAccountApi[]>("/brokers");
export const connectBrokerAccount = (provider: string, clientRequestId: string, displayName?: string) => apiRequest<BrokerAccountApi>("/brokers/connect", { method: "POST", body: JSON.stringify({ provider, client_request_id: clientRequestId, ...(displayName ? { display_name: displayName } : {}) }) });
export const reconnectBrokerAccount = (id: string) => apiRequest<BrokerAccountApi>(`/brokers/${id}/reconnect`, { method: "POST" });
export const syncBrokerAccount = (id: string) => apiRequest<SyncResultApi>(`/brokers/${id}/sync`, { method: "POST" });
export const syncAllBrokerAccounts = () => apiRequest<{ results: SyncResultApi[] }>("/brokers/sync", { method: "POST" });
export const disconnectBrokerAccount = (id: string) => apiRequest<{ broker_account_id: string; status: "disconnected"; retained_positions: number; paused_tools: number }>(`/brokers/${id}`, { method: "DELETE" });
export type PositionQuery = { broker_account_id?: string; search?: string; kind?: "stock" | "future" | "option"; side?: "BUY" | "SELL"; product?: "MIS" | "NRML" | "CNC"; sort?: "recent" | "pnl-desc" | "pnl-asc" | "az" | "qty"; date_from?: string; date_to?: string };
export const getPositions = (status: "open" | "closed", query: PositionQuery = {}) => {
  const params = new URLSearchParams({ status, sort: query.sort ?? "recent" });
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && key !== "sort") params.set(key, value); });
  return apiRequest<PositionListApi>(`/positions?${params.toString()}`);
};
export const getPosition = (id: string) => apiRequest<PositionDetailApi>(`/positions/${id}`);

export type ToolApi = {
  id: string; tool_type: string; status: string; execution_mode: "paper"; config: Record<string, unknown>; config_version: number; version: string;
  summary: string; target_label: string; broker_account_id: string | null; instrument_id: string | null;
  positions: Array<{ id: string; symbol: string; broker_account_id: string; quantity: string; available_quantity: string; role: string }>;
  validation_errors: Record<string, string>; execution_ready: boolean; execution_blockers: string[];
  execution_state?: Record<string, unknown> | null; latest_evaluation_at?: string | null; latest_market_data_at?: string | null;
  execution_failure_reason?: string | null; simulated_order_count?: number;
  armed_at: string | null; paused_at: string | null; created_at: string; updated_at: string;
  events: Array<{ id: string; sequence: number; event_type: string; message: string; occurred_at: string; details: Record<string, unknown> }>;
};
export type ToolDraftPayload = { id: string; tool_type: string; config: Record<string, unknown>; position_ids: string[]; broker_account_id?: string | null; instrument_id?: string | null };
export type InstrumentApi = { id: string; exchange: string; trading_symbol: string; display_symbol: string; kind: "stock" | "future" | "option"; lot_size: string; expiry_date: string | null; metadata: Record<string, unknown> };
export type ToolDefaultApi = { tool_type: string; config: Record<string, unknown>; is_enabled: boolean; version: string };
export type ActivityApi = { id: string; event_type: string; summary: string; tool_instance_id: string | null; position_id: string | null; occurred_at: string; metadata: Record<string, unknown> };

export const getTools = (scope: "drafts" | "active" | "history") => apiRequest<{ items: ToolApi[] }>(`/tools?scope=${scope}`);
export const getTool = (id: string) => apiRequest<ToolApi>(`/tools/${id}`);
export const createToolDraft = (payload: ToolDraftPayload) => apiRequest<ToolApi>("/tools/drafts", { method: "POST", body: JSON.stringify(payload) });
export const updateToolDraft = (id: string, expectedVersion: string, payload: Omit<ToolDraftPayload, "id" | "tool_type">) => apiRequest<ToolApi>(`/tools/${id}`, { method: "PATCH", body: JSON.stringify({ expected_version: expectedVersion, ...payload }) });
export const reviewTool = (id: string, expectedVersion: string) => apiRequest<{ valid: boolean; validation_errors: Record<string, string>; tool: ToolApi }>(`/tools/${id}/review`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) });
export const mutateTool = (id: string, action: "arm" | "pause" | "resume" | "cancel", expectedVersion: string) => apiRequest<ToolApi>(`/tools/${id}/${action}`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) });
export const getToolDefaults = () => apiRequest<ToolDefaultApi[]>("/tool-defaults");
export const saveToolDefaults = (defaults: Array<{ tool_type: string; config: Record<string, unknown>; is_enabled: boolean; expected_version?: string }>) => apiRequest<ToolDefaultApi[]>("/tool-defaults", { method: "PUT", body: JSON.stringify({ defaults }) });
export const getInstruments = () => apiRequest<InstrumentApi[]>("/instruments");
export const getActivityEvents = () => apiRequest<{ items: ActivityApi[]; next_cursor: string | null }>("/activity/events");
