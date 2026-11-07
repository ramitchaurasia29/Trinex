import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import AppShell from "../../AppShell";
import { toolById } from "../../data";
import { Banner, Button } from "../../ui";
import { FlowSteps, InstrumentContext, MobileBar, PositionContext, PreviewRail, ToolHeaderCard } from "./FlowParts";
import { useFlow } from "./useFlow";

export default function Configure() {
  const { tool, toolId, mod, ctx, draft, init, qs, position, instrument, conflicts, store } = useFlow();
  const nav = useNavigate();
  const [config, setConfig] = useState<Record<string, unknown>>(() => {
    const matches = draft && (tool.target === "self" || draft.positionId === position?.id || draft.instrument === instrument?.symbol);
    return matches ? draft!.config : { ...mod.defaults(ctx), ...(init.config ?? {}) };
  });
  const [showErrors, setShowErrors] = useState(!!init.showErrors);

  const errors = mod.validate(config, ctx);
  const missing = Object.keys(errors).length;
  const preview = mod.preview(config, ctx);
  const set = (patch: Record<string, unknown>) => setConfig((c) => ({ ...c, ...patch }));
  const Form = mod.Form;
  const editing = !!draft?.editingId;
  const stepIndex = tool.target === "self" ? 0 : 1;
  const back = editing ? "/positions/armed" : tool.target === "self" ? "/tools" : `/tools/${toolId}/select${qs}`;

  const onReview = () => {
    if (missing) {
      setShowErrors(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    store.setDraft({ toolId, positionId: position?.id, instrument: instrument?.symbol, config, editingId: draft?.editingId });
    nav(`/tools/${toolId}/review${qs}`);
  };

  const cta = (
    <Button full size="lg" iconRight={ArrowRight} onClick={onReview}>
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

          <div className="rounded-lg border border-line bg-surface px-4 sm:px-5">
            <Form value={config} set={set} ctx={ctx} errors={errors} showErrors={showErrors} />
          </div>
        </div>
        <PreviewRail preview={preview} missing={missing} cta={cta} />
      </div>
      <MobileBar preview={preview} cta={cta} />
    </AppShell>
  );
}
