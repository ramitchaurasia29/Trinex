import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Zap, Sunrise } from "lucide-react";
import AppShell from "../../AppShell";
import { toolById } from "../../data";
import { Banner, Button } from "../../ui";
import { FlowSteps, InstrumentContext, MobileBar, PositionContext, PreviewTable, ReviewRows, Sentence, ToolHeaderCard } from "./FlowParts";
import { useFlow } from "./useFlow";

export default function Review() {
  const { tool, toolId, mod, ctx, draft, init, qs, position, instrument, conflicts, store } = useFlow();
  const nav = useNavigate();
  const config = draft?.config ?? { ...mod.defaults(ctx), ...(init.config ?? {}) };
  const [ack, setAck] = useState(!!init.ack);
  const editing = !!draft?.editingId;
  const preview = mod.preview(config, ctx);
  const sections = mod.review(config, ctx);
  const marketOpen = store.market === "open";
  const blocked = conflicts.length > 0 && !ack;
  const stepIndex = tool.target === "self" ? 1 : 2;

  const arm = () => {
    if (blocked) return;
    const target = mod.targetLabel?.(config, ctx) ?? position?.symbol ?? instrument?.symbol ?? "";
    store.arm(
      {
        toolId,
        positionId: position?.id,
        target,
        summary: mod.short(config, ctx),
        status: marketOpen ? (toolId === "trailing-sl" || toolId === "mtm-lock" ? "active" : "waiting") : "queued",
        statusText: marketOpen ? mod.statusText(config, ctx) : "Activates at market open",
        config,
      },
      draft?.editingId,
    );
    store.toast(editing ? `${tool.name} updated` : `${tool.name} armed for ${target}`);
    store.setDraft(null);
    nav("/positions/armed");
  };

  const cta = (
    <Button full size="lg" icon={editing ? Check : Zap} disabled={blocked} onClick={arm}>
      {editing ? "Save changes" : `Arm ${tool.name}`}
    </Button>
  );
  const editLink = (
    <button onClick={() => nav(`/tools/${toolId}/configure${qs}`)} className="text-sm font-medium text-primary hover:underline">
      Edit Configuration
    </button>
  );

  return (
    <AppShell title={editing ? `Edit ${tool.name}` : tool.name} subtitle="Review & arm" back={`/tools/${toolId}/configure${qs}`} flow width="narrow">
      <FlowSteps tool={tool} current={stepIndex} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-lg border border-primary-line bg-primary-soft/50 p-5">
            <p className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">What will happen</p>
            <Sentence parts={preview.sentence} />
            {preview.table && <div className="mt-4"><PreviewTable table={preview.table} /></div>}
          </div>

          {position && <PositionContext position={position} />}
          {instrument && <InstrumentContext instrument={instrument} />}

          {sections.map((s) => <ReviewRows key={s.title} title={s.title} rows={s.rows} />)}

          {!marketOpen && (
            <Banner tone="info" icon={Sunrise}>Market isn't open. This tool will be queued and start monitoring at 9:15 AM.</Banner>
          )}

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-warn-line bg-warn-soft p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-warn"><AlertTriangle size={16} strokeWidth={2} />Another tool is active on this position</p>
              <p className="mt-1 text-sm text-ink-2">
                {conflicts.map((c) => `${toolById(c.toolId).name} (${c.summary})`).join(", ")}. Both tools run independently — the first one to trigger acts on the position and the other adjusts to the remaining quantity.
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4 accent-primary" />
                I understand — arm anyway
              </label>
            </div>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-4">
            <ToolHeaderCard tool={tool} />
            <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
              <p className="mb-3 text-sm text-muted">{marketOpen ? "Starts monitoring the moment you arm it." : "Queued until the market opens."} You can edit or cancel any time from Positions.</p>
              {cta}
              <div className="mt-3 text-center">{editLink}</div>
            </div>
          </div>
        </aside>
      </div>
      <MobileBar cta={<div className="flex flex-col gap-2">{cta}<div className="text-center">{editLink}</div></div>} />
    </AppShell>
  );
}
