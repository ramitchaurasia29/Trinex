import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, Plus, RefreshCw, Shield, XCircle } from "lucide-react";
import AppShell from "../AppShell";
import { ArmedToolCard, CancelToolModal, editArmed, ToolPickerSheet } from "../overlays";
import { inr, num, pnlOf, pctOf, qtyLabel, toolById, type ArmedTool, type HistoryEvent } from "../data";
import { useStore } from "../store";
import { Badge, BrokerTag, Button, Card, EmptyState, Pnl, SectionTitle, SideBadge } from "../ui";
import { useTradingData } from "../trading";

export default function PositionDetail() {
  const { id = "p1" } = useParams();
  const navigate = useNavigate();
  const { positions, armed, history, market, setDraft } = useStore();
  const cached = positions.find((item) => item.id === id);
  const [position, setPosition] = useState(cached);
  const [loading, setLoading] = useState(!cached);
  const trading = useTradingData();
  const [cancel, setCancel] = useState<ArmedTool | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const stale = Boolean(position?.stale) || market === "closed" || market === "holiday";
  useEffect(() => { let current = true; void trading.fetchPosition(id).then((item) => { if (current) setPosition(item); }).catch(() => undefined).finally(() => { if (current) setLoading(false); }); return () => { current = false; }; }, [id]);
  const positionTools = armed.filter((item) => item.positionId === position?.id);
  const instrumentHistory = useMemo(() => {
    if (!position) return [] as HistoryEvent[];
    const events = history.filter((event) => event.instrument === position.symbol).slice(0, 5);
    return events;
  }, [history, position, positionTools]);

  if (loading) return <AppShell title="Position" back="/positions" flow><p className="py-12 text-center text-sm text-muted">Loading position…</p></AppShell>;
  if (!position) return <AppShell title="Position unavailable" back="/positions" flow><EmptyState icon={Activity} title="Position unavailable" body="This position was not found or is not available to your account." action={<Button variant="secondary" onClick={() => navigate("/positions")}>Back to positions</Button>} /></AppShell>;

  const dayChange = position.ltp - position.prevClose;
  const dayChangePct = position.prevClose ? dayChange / position.prevClose * 100 : 0;
  const range = Math.max(0, Math.min(100, (position.ltp - position.dayLow) / (position.dayHigh - position.dayLow || 1) * 100));
  const marginTotal = position.marginUsed + position.marginAvailable;
  const marginRatio = marginTotal ? position.marginUsed / marginTotal : 0;
  const marginLabel = `${inr(position.marginUsed)} used · ${inr(position.marginAvailable)} available`;

  return (
    <AppShell title={position.symbol} subtitle={<span className="flex items-center gap-2"><SideBadge side={position.side} /><BrokerTag id={position.broker} />{position.exchange}</span>} back="/positions" flow>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted">{stale ? "Last close" : "Last traded price"}</p>
                <p className={`mt-1 font-mono text-3xl font-semibold tracking-tight tabular-nums ${stale ? "text-muted" : "text-ink"}`}>₹{num(position.ltp)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2"><Pnl value={dayChange} pct={dayChangePct} className="text-sm" /><span className="text-xs text-muted">vs previous close</span></div>
              </div>
              <Badge tone={stale ? "neutral" : "profit"} dot>{stale ? "Market closed" : "Live"}</Badge>
            </div>
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-xs text-muted"><span>Day range</span><span className="font-mono tabular-nums">₹{num(position.dayLow)} — ₹{num(position.dayHigh)}</span></div>
              <div className="relative h-2 rounded-full bg-surface-3">
                <span className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-primary" style={{ left: `${range}%` }} aria-label={`Current price is ${Math.round(range)}% through day range`} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <PriceDatum label="Open" value={position.open} />
                <PriceDatum label="Prev close" value={position.prevClose} />
                <div className="col-span-2 sm:col-span-1"><p className="text-xs text-muted">Range position</p><p className="mt-1 font-mono text-sm tabular-nums text-ink">{Math.round(range)}%</p></div>
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>Position summary</SectionTitle>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
              <SummaryDatum label="Entry / Avg price" value={`₹${num(position.avg)}`} />
              <SummaryDatum label="Quantity / lots" value={qtyLabel(position)} />
              <div><p className="text-xs text-muted">Unrealized P&amp;L</p><Pnl value={pnlOf(position)} pct={pctOf(position)} className="mt-1 block text-sm" /></div>
              <SummaryDatum label="Product" value={position.product} />
              <SummaryDatum label="Expiry" value={position.expiry ?? "—"} />
              <SummaryDatum label="Holding" value={position.since} />
            </div>
          </Card>

          {position.kind === "option" && position.greeks && <Card>
            <SectionTitle action={<span className="flex items-center gap-1 text-xs font-normal normal-case tracking-normal text-muted"><RefreshCw size={12} strokeWidth={2} />Refreshes every 3s</span>}>Greeks</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[["Delta", position.greeks.delta.toFixed(2)], ["Gamma", position.greeks.gamma.toFixed(4)], ["Theta", position.greeks.theta.toFixed(1)], ["Vega", position.greeks.vega.toFixed(1)], ["IV", `${position.greeks.iv.toFixed(1)}%`]].map(([label, value]) => <div key={label} className="rounded-md border border-line bg-surface-2 px-3 py-2.5"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-mono text-sm font-medium tabular-nums text-ink">{value}</p></div>)}
            </div>
          </Card>}

          <Card>
            <SectionTitle action={<Link to="/activity/history" className="text-xs font-medium text-primary hover:underline">View All →</Link>}>Tool history</SectionTitle>
            {instrumentHistory.length ? <div className="divide-y divide-line">
              {instrumentHistory.map((event) => {
                const Icon = toolById(event.toolId).icon;
                return <div key={event.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2"><Icon size={16} strokeWidth={2} /></span>
                  <div className="min-w-0 flex-1"><p className="text-sm text-ink-2">{event.text}</p><p className="mt-1 font-mono text-xs tabular-nums text-muted">{event.time}</p></div>
                  {event.impact !== undefined && <Pnl value={event.impact} className="text-xs" />}
                </div>;
              })}
            </div> : <p className="rounded-md border border-dashed border-line-strong px-4 py-5 text-sm text-muted">No tool activity for this position yet.</p>}
          </Card>
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24">
          <Card>
            <SectionTitle action={<span className="font-mono text-xs tabular-nums text-muted">{positionTools.length}</span>}>Active Tools</SectionTitle>
            {positionTools.length ? <div className="flex flex-col gap-3">
              {positionTools.map((item) => <ArmedToolCard key={item.id} a={item} onEdit={() => editArmed(navigate, setDraft, positions, item)} onCancel={() => setCancel(item)} />)}
            </div> : <p className="rounded-md border border-dashed border-line-strong px-4 py-5 text-sm text-muted">No tools armed. Add your first tool to automate this position.</p>}
            <Button className="mt-3" full variant={positionTools.length ? "secondary" : "primary"} icon={Plus} onClick={() => setPickerOpen(true)}>Add Tool</Button>
          </Card>
          <Card>
            <SectionTitle action={<Shield size={14} strokeWidth={2} className="text-muted" />}>Margin</SectionTitle>
            <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted">{marginLabel}</span><span className="font-mono font-medium tabular-nums text-ink">{Math.round(marginRatio * 100)}%</span></div>
            <progress value={position.marginUsed} max={marginTotal || 1} aria-label="Margin used" className="mt-3 h-2 w-full overflow-hidden rounded-full accent-primary" />
            <p className="mt-2 text-xs text-muted">Margin utilization for this position</p>
          </Card>
          <div className="hidden gap-2 lg:flex">
            <Button full variant="danger-soft" icon={XCircle} disabled title="Paper execution is unavailable in Phase 3">Close unavailable</Button>
            <Button full icon={Plus} onClick={() => setPickerOpen(true)}>Add Tool</Button>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-line bg-surface px-4 py-3 lg:hidden">
        <Button variant="danger-soft" icon={XCircle} disabled title="Paper execution is unavailable in Phase 3">Close unavailable</Button>
        <Button icon={Plus} onClick={() => setPickerOpen(true)}>Add Tool</Button>
      </div>
      <ToolPickerSheet position={pickerOpen ? position : null} onClose={() => setPickerOpen(false)} />
      <CancelToolModal tool={cancel} onClose={() => setCancel(null)} />
    </AppShell>
  );
}

function PriceDatum({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 font-mono text-sm tabular-nums text-ink">₹{num(value)}</p></div>;
}

function SummaryDatum({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-medium text-ink">{value}</p></div>;
}
