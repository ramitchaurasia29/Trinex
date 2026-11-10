import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import AppShell from "../../AppShell";
import { toolById } from "../../data";
import { Banner, Button, Chip } from "../../ui";
import { ApiError } from "../../api";
import { FlowSteps, InstrumentContext, MobileBar, PositionContext, PreviewRail, ToolHeaderCard } from "./FlowParts";
import { useFlow } from "./useFlow";

export default function Configure() {
  const { tool, toolId, mod, ctx, draft, init, qs, position, instrument, conflicts, store, toolData, defaultConfig } = useFlow();
  const nav = useNavigate();
  const [config, setConfig] = useState<Record<string, unknown>>(() => {
    const matches = draft && (tool.target === "self" || draft.positionId === position?.id || draft.instrument === instrument?.symbol);
    return matches ? (draft!.id ? draft!.config : { ...draft!.config, ...defaultConfig }) : { ...defaultConfig, ...(init.config ?? {}) };
  });
  const [brokerId, setBrokerId] = useState(draft?.brokerAccountId ?? "");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => { if (draft?.id) { setConfig(draft.config); setBrokerId(draft.brokerAccountId ?? ""); } }, [draft?.id, draft?.version]);
  const [showErrors, setShowErrors] = useState(!!init.showErrors);

  const errors = mod.validate(config, ctx);
  const missing = Object.keys(errors).length;
  const preview = mod.preview(config, ctx);
  const set = (patch: Record<string, unknown>) => setConfig((c) => ({ ...c, ...patch }));
  const Form = mod.Form;
  const editing = !!draft?.editingId;
  const stepIndex = tool.target === "self" ? 0 : 1;
  const back = editing ? "/positions/armed" : tool.target === "self" ? "/tools" : `/tools/${toolId}/select${qs}`;

  const persist = async () => {
    setSaving(true); setServerError(null);
    try {
      const positionIds = position ? [position.id] : toolId === "mtm-lock" ? (config.selectedPositionIds as string[] ?? []) : toolId === "dependency" && config.action === "exit" && config.exitPositionId ? [String(config.exitPositionId)] : [];
      const symbol = toolId === "dependency" ? String(config.entrySymbol ?? "") : instrument?.symbol;
      const instrumentId = draft?.instrumentId ?? toolData.instruments.find((item) => item.display_symbol === symbol)?.id;
      const result = await toolData.saveDraft({ ...draft, toolId, positionId: position?.id, instrument: instrument?.symbol, config, brokerAccountId: brokerId || undefined, instrumentId }, positionIds);
      store.setDraft({ id: result.id, version: result.version, toolId, positionId: result.positions[0]?.id ?? position?.id, instrument: instrument?.symbol, config: result.config, brokerAccountId: result.broker_account_id ?? undefined, instrumentId: result.instrument_id ?? undefined, editingId: result.status === "draft" ? undefined : result.id, status: result.status });
      return result;
    } catch (cause) { setServerError(cause instanceof ApiError ? cause.message : "Unable to save draft"); throw cause; }
    finally { setSaving(false); }
  };
  const onReview = async () => {
    if (missing) {
      setShowErrors(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try { const saved = await persist(); const result = await toolData.review(saved.id, saved.version); if (!result.valid) { setServerError("Backend validation found fields that need attention"); setShowErrors(true); return; } const next = new URLSearchParams(); if (position) next.set("pos", position.id); if (instrument) next.set("inst", instrument.symbol); next.set("draft", saved.id); nav(`/tools/${toolId}/review?${next.toString()}`); } catch { /* shown inline */ }
  };

  const cta = (
    <Button full size="lg" iconRight={ArrowRight} disabled={saving} onClick={() => void onReview()}>
      Review &amp; Arm
    </Button>
  );

  return (
    <AppShell title={editing ? `Edit ${tool.name}` : tool.name} subtitle="Configure" back={back} flow width="narrow">
      <FlowSteps tool={tool} current={stepIndex} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {position && <PositionContext position={position} changeTo={editing ? undefined : `/tools/${toolId}/select${qs}`} />}
          {instrument && <InstrumentContext instrument={instrument} changeTo={editing ? undefined : `/tools/${toolId}/select${qs}`} />}
          <ToolHeaderCard tool={toolById(toolId)} />

          {conflicts.length > 0 && (
            <Banner tone="warn" icon={AlertTriangle}>
              {conflicts.map((c) => toolById(c.toolId).name).join(" and ")} {conflicts.length > 1 ? "are" : "is"} already active on this position. Both will run — whichever triggers first acts on the position. You'll confirm this on the next step.
            </Banner>
          )}

          {showErrors && missing > 0 && (
            <Banner tone="loss" icon={AlertTriangle}>
              Complete {missing} highlighted field{missing === 1 ? "" : "s"} to continue.
            </Banner>
          )}
          {serverError && <Banner tone="loss" icon={AlertTriangle}>{serverError}</Banner>}
          {(toolId === "timed-entry" || (toolId === "dependency" && config.action === "entry")) && <div className="rounded-lg border border-line bg-surface p-4"><p className="text-sm font-semibold text-ink">Broker account</p><p className="mt-1 text-xs text-muted">Required for eventual paper entry targeting. No order is submitted in this phase.</p><div className="mt-3 flex flex-wrap gap-2">{store.brokers.filter((item) => item.status === "connected").map((item) => <Chip key={item.id} active={brokerId === item.id} onClick={() => setBrokerId(item.id)}>{item.name}</Chip>)}</div></div>}

          <div className="rounded-lg border border-line bg-surface px-4 sm:px-5">
            <Form value={config} set={set} ctx={ctx} errors={errors} showErrors={showErrors} />
          </div>
        </div>
        <PreviewRail preview={preview} missing={missing} cta={cta} />
      </div>
      <MobileBar preview={preview} cta={cta} />
      <div className="mx-auto mt-4 flex max-w-5xl justify-end"><Button variant="secondary" disabled={saving} onClick={() => void persist().then(() => store.toast("Draft saved"))}>{saving ? "Saving…" : "Save Draft"}</Button></div>
    </AppShell>
  );
}
