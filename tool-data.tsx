import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createToolDraft, getActivityEvents, getInstruments, getTool, getToolDefaults, getTools, mutateTool, reviewTool, saveToolDefaults, updateToolDraft,
  type InstrumentApi, type ToolApi, type ToolDefaultApi, type ToolDraftPayload,
} from "./api";
import { type ArmedStatus, type ArmedTool, type HistoryEvent, type ToolId } from "./data";
import { useAuth } from "./auth";
import { useStore, type Draft } from "./store";

type ToolData = {
  active: ToolApi[]; drafts: ToolApi[]; defaults: ToolDefaultApi[]; instruments: InstrumentApi[]; loading: boolean;
  saveDraft: (draft: Draft, positionIds: string[]) => Promise<ToolApi>;
  review: (id: string, version: string) => Promise<{ valid: boolean; validation_errors: Record<string, string>; tool: ToolApi }>;
  transition: (tool: ToolApi | { id: string; version: string }, action: "arm" | "pause" | "resume" | "cancel") => Promise<ToolApi>;
  saveDefaults: typeof saveToolDefaults;
  refresh: () => Promise<void>;
};

const Context = createContext<ToolData | null>(null);
const fixture = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("figr_screen");

function armedView(item: ToolApi): ArmedTool {
  return { id: item.id, toolId: item.tool_type as ToolId, positionId: item.positions[0]?.id, target: item.target_label, summary: item.summary, status: item.status as ArmedStatus, statusText: item.status === "paused" ? "Paused" : "Waiting for monitoring service", armedAt: item.armed_at ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.armed_at)) : "—", config: item.config, version: item.version };
}

function historyView(item: { id: string; event_type: string; summary: string; occurred_at: string; position_id: string | null; metadata: Record<string, unknown> }): HistoryEvent {
  const when = new Date(item.occurred_at); const today = when.toDateString() === new Date().toDateString();
  return { id: item.id, time: new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(when), day: today ? "Today" : "Yesterday", toolId: String(item.metadata.tool_type ?? "timed-exit") as ToolId, text: item.summary, broker: "mock", instrument: String(item.metadata.target_label ?? "Paper tool") };
}

export function applyToolDefaults(toolType: ToolId, base: Record<string, unknown>, defaults: ToolDefaultApi[]): Record<string, unknown> {
  const saved = defaults.find((item) => item.tool_type === toolType && item.is_enabled)?.config ?? {};
  const direct = Object.fromEntries(Object.entries(saved).filter(([key]) => !["foPartialType", "stockPartialType"].includes(key)));
  const merged = { ...base, ...direct };
  const instrument = String(merged.instrument ?? "");
  if ("partialType" in merged) merged.partialType = instrument === "fo" ? saved.foPartialType ?? merged.partialType : saved.stockPartialType ?? merged.partialType;
  return merged;
}

export function ToolDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(); const store = useStore(); const queryClient = useQueryClient(); const enabled = Boolean(user) && !fixture();
  const activeQuery = useQuery({ queryKey: ["tools", "active"], queryFn: () => getTools("active"), enabled });
  const draftQuery = useQuery({ queryKey: ["tools", "drafts"], queryFn: () => getTools("drafts"), enabled });
  const activityQuery = useQuery({ queryKey: ["activity", "tools"], queryFn: getActivityEvents, enabled });
  const defaultsQuery = useQuery({ queryKey: ["tool-defaults"], queryFn: getToolDefaults, enabled });
  const instrumentsQuery = useQuery({ queryKey: ["instruments"], queryFn: getInstruments, enabled });
  useEffect(() => { if (activeQuery.data) store.replaceArmed(activeQuery.data.items.map(armedView)); }, [activeQuery.data]);
  useEffect(() => { if (activityQuery.data) store.replaceHistory(activityQuery.data.items.map(historyView)); }, [activityQuery.data]);
  useEffect(() => { if (!user) queryClient.removeQueries({ queryKey: ["tools"] }); }, [user, queryClient]);
  const invalidate = useCallback(async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["tools"] }), queryClient.invalidateQueries({ queryKey: ["tool"] }), queryClient.invalidateQueries({ queryKey: ["activity"] })]); }, [queryClient]);
  const value = useMemo<ToolData>(() => ({
    active: activeQuery.data?.items ?? [], drafts: draftQuery.data?.items ?? [], defaults: defaultsQuery.data ?? [], instruments: instrumentsQuery.data ?? [], loading: activeQuery.isLoading || draftQuery.isLoading,
    saveDraft: async (draft, positionIds) => {
      const payload = { config: draft.config, position_ids: positionIds, broker_account_id: draft.brokerAccountId ?? null, instrument_id: draft.instrumentId ?? null };
      const result = draft.id && draft.version ? await updateToolDraft(draft.id, draft.version, payload) : await createToolDraft({ id: draft.id ?? crypto.randomUUID(), tool_type: draft.toolId, ...payload });
      await invalidate(); return result;
    },
    review: async (id, version) => { const result = await reviewTool(id, version); await invalidate(); return result; },
    transition: async (tool, action) => { const result = await mutateTool(tool.id, action, tool.version); await invalidate(); return result; },
    saveDefaults: async (items) => { const result = await saveToolDefaults(items); await queryClient.invalidateQueries({ queryKey: ["tool-defaults"] }); return result; },
    refresh: invalidate,
  }), [activeQuery.data, activeQuery.isLoading, draftQuery.data, draftQuery.isLoading, defaultsQuery.data, instrumentsQuery.data, invalidate, queryClient]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useToolData() { const value = useContext(Context); if (!value) throw new Error("useToolData outside provider"); return value; }
export function useToolQuery(id?: string) { return useQuery({ queryKey: ["tool", id], queryFn: () => getTool(id!), enabled: Boolean(id) && !fixture() }); }
