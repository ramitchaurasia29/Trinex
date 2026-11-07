import { useState } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { ChevronRight, Pencil, Plus, Trash2, XCircle, AlertTriangle, ChevronRight as Chev } from "lucide-react";
import { CATEGORIES, TOOLS, num, pnlOf, pctOf, qtyLabel, toolById, brokerName, type ArmedTool, type Position, type ToolId } from "./data";
import { useStore, type Draft } from "./store";
import { Badge, BrokerTag, Button, Dot, Modal, Pnl, Sheet, SideBadge, STATUS_TONE } from "./ui";
import { MODULES } from "./tools/registry";

/* ------------------------------------------------------------------ */
/* Navigation helpers                                                  */
/* ------------------------------------------------------------------ */

/** Start a tool's flow. With a position, skips straight to Configure. */
export function startTool(nav: NavigateFunction, setDraft: (d: Draft | null) => void, positions: Position[], toolId: ToolId, positionId?: string) {
  const tool = toolById(toolId);
  if (tool.target === "position" && positionId) {
    const position = positions.find((p) => p.id === positionId);
    setDraft({ toolId, positionId, config: MODULES[toolId].defaults({ position, positions }) });
    nav(`/tools/${toolId}/configure?pos=${positionId}`);
  } else if (tool.target === "self") {
    setDraft(null);
    nav(`/tools/${toolId}/configure`);
  } else {
    setDraft(null);
    nav(`/tools/${toolId}/select`);
  }
}

/** Open an armed tool for editing (prefilled Configure). */
export function editArmed(nav: NavigateFunction, setDraft: (d: Draft | null) => void, positions: Position[], a: ArmedTool) {
  const position = positions.find((p) => p.id === a.positionId);
  const config = a.config ?? MODULES[a.toolId].defaults({ position, positions });
  setDraft({ toolId: a.toolId, positionId: a.positionId, config, editingId: a.id });
  nav(`/tools/${a.toolId}/configure${a.positionId ? `?pos=${a.positionId}` : ""}`);
}

/* ------------------------------------------------------------------ */
/* Tool chip (position cards)                                          */
/* ------------------------------------------------------------------ */

export function ToolChip({ a, onClick }: { a: ArmedTool; onClick?: () => void }) {
  const t = toolById(a.toolId);
  const Icon = t.icon;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-2 text-xs font-medium text-ink-2 hover:border-line-strong hover:text-ink"
      title={`${t.name} · ${a.statusText}`}
    >
      <Dot tone={STATUS_TONE[a.status]} />
      <Icon size={13} strokeWidth={2} className="shrink-0" />
      <span className="truncate">{t.name}</span>
    </button>
  );
}

export function AddToolChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 text-xs font-medium text-primary hover:border-primary hover:bg-primary-soft"
    >
      <Plus size={13} strokeWidth={2.25} /> Add tool
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Tool picker (Add Tool to [Instrument])                              */
/* ------------------------------------------------------------------ */

export function ToolPickerSheet({ position, onClose }: { position: Position | null; onClose: () => void }) {
  const nav = useNavigate();
  const { armed, setDraft, positions } = useStore();
  if (!position) return null;
  const onPos = armed.filter((a) => a.positionId === position.id);
  return (
    <Sheet open onClose={onClose} title={`Add tool to ${position.symbol}`} subtitle={<span className="flex items-center gap-2"><SideBadge side={position.side} /> {qtyLabel(position)} · {brokerName(position.broker)}</span>}>
      <div className="flex flex-col gap-5">
        {CATEGORIES.map((c) => (
          <div key={c.id}>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{c.name}</p>
            <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {TOOLS.filter((t) => t.category === c.id).map((t) => {
                const Icon = t.icon;
                const active = onPos.some((a) => a.toolId === t.id);
                const na = t.target !== "position";
                const reason = active ? "Already armed on this position" : na ? (t.target === "instrument" ? "Places a new entry — start it from Tools" : "Works across positions — start it from Tools") : t.how;
                return (
                  <button
                    key={t.id}
                    disabled={active || na}
                    onClick={() => { onClose(); startTool(nav, setDraft, positions, t.id, position.id); }}
                    className="flex items-center gap-3 px-3 py-3 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <span className={["flex h-9 w-9 shrink-0 items-center justify-center rounded-md", active || na ? "bg-surface-2 text-faint" : "bg-primary-soft text-primary"].join(" ")}>
                      <Icon size={18} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={["block text-sm font-medium", active || na ? "text-muted" : "text-ink"].join(" ")}>{t.name}</span>
                      <span className="block truncate text-xs text-muted">{reason}</span>
                    </span>
                    {active ? <Badge tone="profit" dot>Active</Badge> : !na && <ChevronRight size={16} strokeWidth={2} className="text-faint" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Armed tools on a position (Edit / Cancel)                           */
/* ------------------------------------------------------------------ */

export function ArmedToolCard({ a, onEdit, onCancel, compact }: { a: ArmedTool; onEdit: () => void; onCancel: () => void; compact?: boolean }) {
  const t = toolById(a.toolId);
  const Icon = t.icon;
  const tone = STATUS_TONE[a.status];
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">{t.name}</span>
            <Badge tone={tone} dot>{a.statusText}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-ink-2">{a.summary}</p>
          {a.metric && !compact && (
            <div className="mt-2">
              <div className="flex justify-between text-xs"><span className="text-muted">{a.metric.label}</span><span className="font-mono text-ink tabular-nums">{a.metric.value}</span></div>
              {a.metric.progress !== undefined && (
                <div className="mt-1.5 h-1 rounded-full bg-surface-3">
                  <div className={["h-1 rounded-full", tone === "loss" ? "bg-loss-dot" : tone === "profit" ? "bg-profit-dot" : "bg-warn-dot"].join(" ")} style={{ width: `${Math.round(a.metric.progress * 100)}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        <Button size="sm" variant="secondary" icon={Pencil} onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="ghost" icon={XCircle} onClick={onCancel} className="text-loss hover:bg-loss-soft hover:text-loss">Cancel tool</Button>
        <span className="ml-auto self-center text-xs text-faint">Armed {a.armedAt}</span>
      </div>
    </div>
  );
}

export function ArmedToolsSheet({ position, onClose, onAdd }: { position: Position | null; onClose: () => void; onAdd: (p: Position) => void }) {
  const nav = useNavigate();
  const { armed, setDraft, positions } = useStore();
  const [cancel, setCancel] = useState<ArmedTool | null>(null);
  if (!position) return null;
  const list = armed.filter((a) => a.positionId === position.id);
  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={position.symbol}
        subtitle={<span className="flex items-center gap-2"><SideBadge side={position.side} />{qtyLabel(position)} · <span className="font-mono">₹{num(position.ltp)}</span> · <Pnl value={pnlOf(position)} pct={pctOf(position)} className="text-xs" /></span>}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" full onClick={() => { onClose(); nav(`/position/${position.id}`); }} iconRight={Chev}>Position detail</Button>
            <Button full icon={Plus} onClick={() => { onClose(); onAdd(position); }}>Add another tool</Button>
          </div>
        }
      >
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{list.length} active tool{list.length === 1 ? "" : "s"}</p>
        <div className="flex flex-col gap-3">
          {list.map((a) => (
            <ArmedToolCard key={a.id} a={a} onEdit={() => { onClose(); editArmed(nav, setDraft, positions, a); }} onCancel={() => setCancel(a)} />
          ))}
        </div>
      </Sheet>
      <CancelToolModal tool={cancel} onClose={() => setCancel(null)} />
    </>
  );
}

export function CancelToolModal({ tool, onClose }: { tool: ArmedTool | null; onClose: () => void }) {
  const { cancelArmed, toast } = useStore();
  if (!tool) return null;
  const t = toolById(tool.toolId);
  return (
    <Modal
      open
      onClose={onClose}
      tone="danger"
      icon={Trash2}
      title={`Cancel ${t.name} on ${tool.target}?`}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Keep Active</Button>
          <Button variant="danger" onClick={() => { cancelArmed(tool.id); toast(`${t.name} cancelled`); onClose(); }}>Yes, Cancel</Button>
        </>
      }
    >
      This will deactivate the tool immediately. It cannot be undone.
    </Modal>
  );
}

export function ClosePositionModal({ position, onClose, onDone }: { position: Position | null; onClose: () => void; onDone?: () => void }) {
  const { armed, closePosition, toast } = useStore();
  if (!position) return null;
  const tools = armed.filter((a) => a.positionId === position.id);
  return (
    <Modal
      open
      onClose={onClose}
      tone="danger"
      icon={AlertTriangle}
      title={`Close ${position.symbol} position via ${brokerName(position.broker)}?`}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Keep Position</Button>
          <Button variant="danger" onClick={() => { closePosition(position.id); toast(`${position.symbol} closed at market · ${brokerName(position.broker)}`); onClose(); onDone?.(); }}>Close at market</Button>
        </>
      }
    >
      <p>A market order for {qtyLabel(position)} will be sent to {brokerName(position.broker)}. Current P&amp;L <Pnl value={pnlOf(position)} className="text-sm" />.</p>
      {tools.length > 0 && (
        <div className="mt-3 rounded-md border border-warn-line bg-warn-soft p-3">
          <p className="text-sm font-medium text-warn">{tools.length} active tool{tools.length === 1 ? "" : "s"} will be cancelled</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-2">
            {tools.map((a) => <li key={a.id}>· {toolById(a.toolId).name} — {a.summary}</li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}

export { BrokerTag };
