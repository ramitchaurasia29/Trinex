import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { INSTRUMENTS, TOOLS, toolById, type ToolId } from "../../data";
import { useStore } from "../../store";
import { useScreenInit } from "../../useScreenInit";
import { MODULES } from "../../tools/registry";
import type { ToolCtx } from "../../tools/types";

/** Resolves tool, module, target (position / instrument) and the current draft for any flow step. */
export function useFlow() {
  const params = useParams();
  const [sp] = useSearchParams();
  const init = useScreenInit() as { pos?: string; inst?: string; config?: Record<string, unknown>; showErrors?: boolean; ack?: boolean };
  const store = useStore();
  const toolId = (TOOLS.some((t) => t.id === params.toolId) ? params.toolId : "timed-exit") as ToolId;
  const tool = toolById(toolId);
  const mod = MODULES[toolId];
  const draft = store.draft && store.draft.toolId === toolId ? store.draft : null;

  const posId = sp.get("pos") ?? draft?.positionId ?? init.pos ?? (tool.target === "position" ? "p1" : undefined);
  const instSym = sp.get("inst") ?? draft?.instrument ?? init.inst ?? (tool.target === "instrument" ? "NIFTY 24500 CE" : undefined);

  const position = tool.target === "position" ? store.positions.find((p) => p.id === posId) ?? store.positions[0] : undefined;
  const instrument = tool.target === "instrument" ? INSTRUMENTS.find((i) => i.symbol === instSym) ?? INSTRUMENTS[3] : undefined;

  const ctx: ToolCtx = useMemo(() => ({ position, instrument, positions: store.positions }), [position, instrument, store.positions]);

  const qs = position ? `?pos=${position.id}` : instrument ? `?inst=${encodeURIComponent(instrument.symbol)}` : "";

  const conflicts = position
    ? store.armed.filter((a) => a.positionId === position.id && a.id !== draft?.editingId)
    : [];

  return { tool, toolId, mod, ctx, draft, init, qs, position, instrument, conflicts, store };
}
