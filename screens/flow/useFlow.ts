import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { INSTRUMENTS, TOOLS, toolById, type ToolId } from "../../data";
import { useStore } from "../../store";
import { useScreenInit } from "../../useScreenInit";
import { MODULES } from "../../tools/registry";
import type { ToolCtx } from "../../tools/types";
import { applyToolDefaults, useToolData, useToolQuery } from "../../tool-data";

/** Resolves tool, module, target (position / instrument) and the current draft for any flow step. */
export function useFlow() {
  const params = useParams();
  const [sp] = useSearchParams();
  const init = useScreenInit() as { pos?: string; inst?: string; config?: Record<string, unknown>; showErrors?: boolean; ack?: boolean };
  const store = useStore();
  const toolData = useToolData();
  const remoteQuery = useToolQuery(sp.get("draft") ?? undefined);
  const toolId = (TOOLS.some((t) => t.id === params.toolId) ? params.toolId : "timed-exit") as ToolId;
  const tool = toolById(toolId);
  const mod = MODULES[toolId];
  const remote = remoteQuery.data;
  const remoteDraft = remote && remote.tool_type === toolId ? { id: remote.id, version: remote.version, toolId, positionId: remote.positions[0]?.id, instrument: toolData.instruments.find((item) => item.id === remote.instrument_id)?.display_symbol, instrumentId: remote.instrument_id ?? undefined, brokerAccountId: remote.broker_account_id ?? undefined, config: remote.config, editingId: remote.status === "draft" ? undefined : remote.id, status: remote.status } : null;
  const draft = store.draft && store.draft.toolId === toolId ? store.draft : remoteDraft;

  const posId = sp.get("pos") ?? draft?.positionId ?? init.pos ?? (tool.target === "position" ? "p1" : undefined);
  const instSym = sp.get("inst") ?? draft?.instrument ?? init.inst ?? (tool.target === "instrument" ? "NIFTY 24500 CE" : undefined);

  const position = tool.target === "position" ? store.positions.find((p) => p.id === posId) ?? store.positions[0] : undefined;
  const instrument = tool.target === "instrument" ? INSTRUMENTS.find((i) => i.symbol === instSym) ?? INSTRUMENTS[3] : undefined;

  const ctx: ToolCtx = useMemo(() => ({ position, instrument, positions: store.positions }), [position, instrument, store.positions]);

  const query = new URLSearchParams(); if (position) query.set("pos", position.id); else if (instrument) query.set("inst", instrument.symbol); if (draft?.id) query.set("draft", draft.id);
  const qs = query.size ? `?${query.toString()}` : "";

  const conflicts = position
    ? store.armed.filter((a) => a.positionId === position.id && a.id !== draft?.editingId)
    : [];

  return { tool, toolId, mod, ctx, draft, init, qs, position, instrument, conflicts, store, toolData, remoteLoading: remoteQuery.isLoading, defaultConfig: applyToolDefaults(toolId, mod.defaults(ctx), toolData.defaults) };
}
