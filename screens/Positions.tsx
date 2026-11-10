import { useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw, ChevronRight, ArrowUpDown, Inbox, Zap, History, Plug, SlidersHorizontal, Check } from "lucide-react";
import AppShell from "../AppShell";
import { CLOSED, brokerName, inr, isFO, num, pnlOf, pctOf, qtyLabel, toolById, TOOLS, type BrokerId, type ClosedPosition, type Position } from "../data";
import { useStore } from "../store";
import { useTradingData } from "../trading";
import { useScreenInit } from "../useScreenInit";
import { Badge, BrokerTag, Button, Chip, EmptyState, IconButton, Pnl, Segmented, SideBadge, STATUS_TONE, Tabs, type Tone } from "../ui";
import { AddToolChip, ArmedToolsSheet, ToolChip, ToolPickerSheet, editArmed, CancelToolModal } from "../overlays";
import type { ArmedTool } from "../data";

type Tab = "open" | "armed" | "closed";
type Sort = "pnl-desc" | "pnl-asc" | "az" | "recent" | "qty";

const SORTS: { value: Sort; label: string }[] = [
  { value: "pnl-desc", label: "P&L High → Low" },
  { value: "pnl-asc", label: "P&L Low → High" },
  { value: "az", label: "Instrument (A–Z)" },
  { value: "recent", label: "Recent" },
  { value: "qty", label: "Quantity" },
];

export default function Positions() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const init = useScreenInit() as { empty?: boolean; group?: "position" | "tool"; day?: "today" | "yesterday" | "week" };
  const store = useStore();
  const trading = useTradingData();
  const tab: Tab = pathname.endsWith("/armed") ? "armed" : pathname.endsWith("/closed") ? "closed" : "open";
  const empty = !!init.empty || sp.get("empty") === "1";
  const positions = empty ? [] : store.positions;
  const armed = empty ? [] : store.armed;

  const [broker, setBroker] = useState<string | "all">("all");
  const [picker, setPicker] = useState<Position | null>(null);
  const [sheet, setSheet] = useState<Position | null>(null);

  const scoped = positions.filter((p) => broker === "all" || p.brokerAccountId === broker);
  const total = scoped.reduce((s, p) => s + pnlOf(p), 0);
  const invested = scoped.reduce((s, p) => s + p.avg * p.qty, 0);
  const brokerCounts = store.brokers
    .map((b) => ({ ...b, n: positions.filter((p) => p.brokerAccountId === b.id).length }))
    .filter((b) => b.n > 0);
  const stale = store.market === "closed" || store.market === "holiday" || scoped.some((position) => position.stale);

  return (
    <AppShell
      title="Positions"
      subtitle={empty ? "No brokers connected" : `${positions.length} open across ${brokerCounts.length} brokers · ${trading.lastSyncedAt ? "Backend synced" : "Not synced yet"}`}
      actions={<IconButton icon={RefreshCw} label="Refresh all brokers" onClick={() => void trading.syncAll().then(() => store.toast("Simulated positions synchronized", "info")).catch(() => store.toast(trading.error ?? "Synchronization failed", "error"))} />}
    >
      {empty ? (
        <EmptyState
          icon={Plug}
          title="No open positions"
          body="Connect a broker to see your positions here. Sync is read-only through official broker APIs."
          action={<Button icon={Plug} onClick={() => nav("/more/brokers")}>Connect Broker</Button>}
        />
      ) : (
        <>
          {/* Summary */}
          <div className="mb-5 grid gap-4 rounded-lg border border-line bg-surface p-4 shadow-card sm:p-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-medium text-muted">{broker === "all" ? "Total unrealised P&L" : `${store.brokers.find((b) => b.id === broker)?.name ?? "Broker"} · unrealised P&L`}</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <Pnl value={total} size="xl" className={stale ? "opacity-60" : ""} />
                <span className={["font-mono text-sm tabular-nums", total >= 0 ? "text-profit" : "text-loss"].join(" ")}>
                  {total >= 0 ? "▲" : "▼"} {Math.abs((total / invested) * 100).toFixed(2)}%
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {scoped.length} positions · {armed.filter((a) => !a.positionId || scoped.some((p) => p.id === a.positionId)).length} tools armed{stale ? " · Showing last close" : ""}
              </p>
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <Chip active={broker === "all"} onClick={() => setBroker("all")}>All · {positions.length}</Chip>
              {brokerCounts.map((b) => (
                <Chip key={b.id} active={broker === b.id} onClick={() => setBroker(b.id)}>{b.short} · {b.n}</Chip>
              ))}
            </div>
          </div>

          <Tabs
            items={[
              { value: "open", label: "Open", count: scoped.length },
              { value: "armed", label: "Armed", count: armed.length },
              { value: "closed", label: "Closed" },
            ]}
            value={tab}
            onChange={(t) => nav(t === "open" ? "/positions" : `/positions/${t}`)}
          />

          <div className="mt-4">
            {tab === "open" && <OpenList positions={scoped} armed={armed} onAdd={setPicker} onTools={setSheet} stale={stale} />}
            {tab === "armed" && <ArmedList armed={armed} positions={positions} initialGroup={init.group} onTools={setSheet} />}
            {tab === "closed" && <ClosedList initialDay={init.day} closed={empty ? [] : store.closed} broker={broker} />}
          </div>
        </>
      )}
      <ToolPickerSheet position={picker} onClose={() => setPicker(null)} />
      <ArmedToolsSheet position={sheet} onClose={() => setSheet(null)} onAdd={(p) => setPicker(p)} />
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Open                                                                */
/* ------------------------------------------------------------------ */

function OpenList({ positions, armed, onAdd, onTools, stale }: { positions: Position[]; armed: ArmedTool[]; onAdd: (p: Position) => void; onTools: (p: Position) => void; stale: boolean }) {
  const nav = useNavigate();
  const [sort, setSort] = useState<Sort>("pnl-desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [kind, setKind] = useState<"all" | "fo" | "stock">("all");
  const [side, setSide] = useState<"all" | "BUY" | "SELL">("all");
  const [hasTools, setHasTools] = useState<"all" | "yes" | "no">("all");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const list = useMemo(() => {
    const l = positions.filter((p) => {
      const t = armed.some((a) => a.positionId === p.id);
      return p.symbol.toLowerCase().includes(search.trim().toLowerCase()) && (kind === "all" || (kind === "fo" ? isFO(p.kind) : !isFO(p.kind))) && (side === "all" || p.side === side) && (hasTools === "all" || (hasTools === "yes" ? t : !t));
    });
    const s = [...l];
    if (sort === "pnl-desc") s.sort((a, b) => pnlOf(b) - pnlOf(a));
    if (sort === "pnl-asc") s.sort((a, b) => pnlOf(a) - pnlOf(b));
    if (sort === "az") s.sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (sort === "qty") s.sort((a, b) => b.qty - a.qty);
    return s;
  }, [positions, armed, sort, kind, side, hasTools, search]);

  const activeFilters = [search.trim() !== "", kind !== "all", side !== "all", hasTools !== "all"].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Button size="sm" variant="secondary" icon={ArrowUpDown} onClick={() => setSortOpen(!sortOpen)}>{SORTS.find((s) => s.value === sort)?.label}</Button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
              <div className="absolute left-0 z-40 mt-1 w-52 rounded-lg border border-line bg-surface p-1 shadow-pop">
                {SORTS.map((s) => (
                  <button key={s.value} onClick={() => { setSort(s.value); setSortOpen(false); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2">
                    {s.label}
                    {sort === s.value && <Check size={14} strokeWidth={2} className="text-primary" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <Button size="sm" variant={activeFilters ? "primary" : "secondary"} icon={SlidersHorizontal} onClick={() => setFiltersOpen(!filtersOpen)}>
          Filter{activeFilters ? ` · ${activeFilters}` : ""}
        </Button>
        {activeFilters > 0 && <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setKind("all"); setSide("all"); setHasTools("all"); }}>Clear</Button>}
      </div>
      {filtersOpen && (
        <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3">
          <label className="sm:col-span-3"><span className="mb-1.5 block text-xs font-medium text-ink-2">Search positions</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Symbol or instrument" className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-primary" /></label>
          <div><p className="mb-1.5 text-xs font-medium text-ink-2">Instrument</p><Segmented size="sm" value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "fo", label: "F&O" }, { value: "stock", label: "Equity" }]} /></div>
          <div><p className="mb-1.5 text-xs font-medium text-ink-2">Side</p><Segmented size="sm" value={side} onChange={setSide} options={[{ value: "all", label: "All" }, { value: "BUY", label: "Buy" }, { value: "SELL", label: "Sell" }]} /></div>
          <div><p className="mb-1.5 text-xs font-medium text-ink-2">Tools</p><Segmented size="sm" value={hasTools} onChange={setHasTools} options={[{ value: "all", label: "All" }, { value: "yes", label: "Has tools" }, { value: "no", label: "No tools" }]} /></div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState icon={Inbox} title="No positions match" body="Try a different broker or clear filters." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
          <div className="hidden grid-cols-[minmax(220px,1.6fr)_0.8fr_0.8fr_1fr_minmax(260px,1.8fr)_24px] gap-4 border-b border-line bg-surface-2 px-4 py-2.5 text-xs font-medium text-muted lg:grid">
            <span>Instrument</span><span className="text-right">Avg</span><span className="text-right">LTP</span><span className="text-right">P&amp;L</span><span>Tools</span><span />
          </div>
          <div className="divide-y divide-line">
            {list.map((p) => {
              const tools = armed.filter((a) => a.positionId === p.id);
              return (
                <div
                  key={p.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => nav(`/position/${p.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && nav(`/position/${p.id}`)}
                  className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-4 hover:bg-surface-2/60 lg:grid-cols-[minmax(220px,1.6fr)_0.8fr_0.8fr_1fr_minmax(260px,1.8fr)_24px] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tracking-tight text-ink">{p.symbol}</span>
                      <SideBadge side={p.side} />
                      <BrokerTag id={p.broker} />
                      <Badge tone="primary">PAPER</Badge>
                      {p.stale && <Badge tone="warn">Stale</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">{qtyLabel(p)} · {p.product}{p.expiry ? ` · Exp ${p.expiry}` : ""}</p>
                  </div>
                  <div className="text-right lg:hidden">
                    <Pnl value={pnlOf(p)} className={stale ? "opacity-60" : ""} />
                    <p className="mt-0.5 font-mono text-xs text-muted tabular-nums">LTP ₹{num(p.ltp)}</p>
                  </div>
                  <span className="hidden text-right font-mono text-sm text-ink-2 tabular-nums lg:block">₹{num(p.avg)}</span>
                  <span className={["hidden text-right font-mono text-sm tabular-nums lg:block", stale ? "text-muted" : "text-ink"].join(" ")}>₹{num(p.ltp)}</span>
                  <span className="hidden text-right lg:block"><Pnl value={pnlOf(p)} className={stale ? "opacity-60" : ""} /><span className={["block font-mono text-xs tabular-nums", pctOf(p) >= 0 ? "text-profit" : "text-loss"].join(" ")}>{pctOf(p) >= 0 ? "+" : "−"}{Math.abs(pctOf(p)).toFixed(2)}%</span></span>
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1">
                    {tools.map((a) => <ToolChip key={a.id} a={a} onClick={() => onTools(p)} />)}
                    <AddToolChip onClick={() => onAdd(p)} />
                  </div>
                  <ChevronRight size={16} strokeWidth={2} className="hidden text-faint lg:block" />
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-center text-xs text-faint">Prices stream live · tap a position for detail, or “Add tool” to automate it.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Armed                                                               */
/* ------------------------------------------------------------------ */

function ArmedList({ armed, positions, initialGroup, onTools }: { armed: ArmedTool[]; positions: Position[]; initialGroup?: "position" | "tool"; onTools: (p: Position) => void }) {
  const nav = useNavigate();
  const { setDraft } = useStore();
  const [group, setGroup] = useState<"position" | "tool">(initialGroup ?? "position");
  const [cancel, setCancel] = useState<ArmedTool | null>(null);

  if (!armed.length)
    return (
      <EmptyState icon={Zap} title="No armed tools yet" body="Add tools to your positions from the Open tab or Tools tab." action={<Button icon={Zap} onClick={() => nav("/tools")}>Browse tools</Button>} />
    );

  const byPos = positions.filter((p) => armed.some((a) => a.positionId === p.id));
  const crossPos = armed.filter((a) => !a.positionId);

  const Row = ({ a }: { a: ArmedTool }) => {
    const t = toolById(a.toolId);
    const Icon = t.icon;
    const tone: Tone = STATUS_TONE[a.status];
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2"><Icon size={16} strokeWidth={2} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{group === "tool" ? a.target : t.name}</p>
          <p className="text-xs text-muted">{a.summary}</p>
        </div>
        <Badge tone={tone} dot>{a.statusText}</Badge>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => editArmed(nav, setDraft, positions, a)}>Edit</Button>
          <Button size="sm" variant="ghost" className="text-loss hover:bg-loss-soft hover:text-loss" onClick={() => setCancel(a)}>Cancel</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{armed.length} tools working for you</p>
        <div className="w-56"><Segmented size="sm" value={group} onChange={setGroup} options={[{ value: "position", label: "By Position" }, { value: "tool", label: "By Tool" }]} /></div>
      </div>

      {group === "position" ? (
        <>
          {byPos.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
              <button onClick={() => onTools(p)} className="flex w-full flex-wrap items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-3 text-left hover:bg-surface-2">
                <span className="text-sm font-semibold tracking-tight">{p.symbol}</span>
                <SideBadge side={p.side} />
                <BrokerTag id={p.broker} />
                <span className="text-xs text-muted">{qtyLabel(p)}</span>
                <span className="ml-auto"><Pnl value={pnlOf(p)} pct={pctOf(p)} /></span>
              </button>
              <div className="divide-y divide-line">{armed.filter((a) => a.positionId === p.id).map((a) => <Row key={a.id} a={a} />)}</div>
            </div>
          ))}
          {crossPos.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
              <div className="border-b border-line bg-surface-2/60 px-4 py-3 text-sm font-semibold tracking-tight">Across positions</div>
              <div className="divide-y divide-line">{crossPos.map((a) => (
                <div key={a.id}>
                  <p className="px-4 pt-3 text-xs text-muted">{a.target}</p>
                  <Row a={a} />
                </div>
              ))}</div>
            </div>
          )}
        </>
      ) : (
        TOOLS.filter((t) => armed.some((a) => a.toolId === t.id)).map((t) => {
          const Icon = t.icon;
          const items = armed.filter((a) => a.toolId === t.id);
          return (
            <div key={t.id} className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
              <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-3">
                <Icon size={16} strokeWidth={2} />
                <span className="text-sm font-semibold tracking-tight">{t.name}</span>
                <Badge>{items.length} active</Badge>
              </div>
              <div className="divide-y divide-line">{items.map((a) => <Row key={a.id} a={a} />)}</div>
            </div>
          );
        })
      )}
      <CancelToolModal tool={cancel} onClose={() => setCancel(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Closed                                                              */
/* ------------------------------------------------------------------ */

const METHOD_TONE: Record<string, Tone> = {
  Manual: "neutral", External: "neutral", "SL Hit": "loss", "Target Hit": "profit",
  "Timed Exit": "primary", "Auto-Close": "primary", "Range Break": "primary", "No-Motion": "primary", "MTM Lock": "primary",
};

function ClosedList({ closed, initialDay, broker }: { closed: ClosedPosition[]; initialDay?: "today" | "yesterday" | "week"; broker: string | "all" }) {
  const [day, setDay] = useState<"today" | "yesterday" | "week" | "custom">(initialDay ?? "today");
  const list = closed.filter((c) => (broker === "all" || c.brokerAccountId === broker) && (day === "week" || day === "custom" ? true : c.day === day));
  const realised = list.reduce((s, c) => s + c.pnl, 0);
  const wins = list.filter((c) => c.pnl > 0).length;
  const byTools = list.filter((c) => c.method !== "Manual" && c.method !== "External").length;
  const toolPnl = list.filter((c) => c.method !== "Manual" && c.method !== "External").reduce((s, c) => s + c.pnl, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {(["today", "yesterday", "week", "custom"] as const).map((d) => (
          <Chip key={d} active={day === d} onClick={() => setDay(d)}>{d === "today" ? "Today" : d === "yesterday" ? "Yesterday" : d === "week" ? "This Week" : "Custom Range"}</Chip>
        ))}
      </div>
      {day === "custom" && <p className="text-xs text-muted">Showing 9 Jun – 13 Jun 2026</p>}

      <div className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface shadow-card">
        <div className="p-4"><p className="text-xs text-muted">Realised P&amp;L</p><Pnl value={realised} size="lg" className="mt-1 block" /></div>
        <div className="p-4"><p className="text-xs text-muted">Win / Loss</p><p className="mt-1 font-mono text-xl font-medium tabular-nums">{wins}W / {list.length - wins}L</p></div>
        <div className="p-4"><p className="text-xs text-muted">Exits by tools</p><p className="mt-1 font-mono text-xl font-medium tabular-nums">{byTools}<span className="text-sm text-muted"> of {list.length}</span></p><p className="text-xs text-muted">{inr(toolPnl, { sign: true })} tool-assisted</p></div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={History} title="No closed positions today." body="Closed trades appear here with how they were exited." />
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-card">
          {list.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-4 py-4 lg:grid-cols-[minmax(220px,1.6fr)_1.2fr_1fr_1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight">{c.symbol}</span>
                  <SideBadge side={c.side} />
                  <BrokerTag id={c.broker} />
                </div>
                <p className="mt-1 text-xs text-muted">{c.qtyLabel} · Closed {c.closedAt}</p>
              </div>
              <div className="text-right lg:order-last"><Pnl value={c.pnl} /><p className="font-mono text-xs text-muted tabular-nums">{c.pct > 0 ? "+" : "−"}{Math.abs(c.pct).toFixed(1)}%</p></div>
              <p className="font-mono text-xs text-ink-2 tabular-nums lg:text-sm">₹{num(c.entry)} → ₹{num(c.exit)}</p>
              <span className="lg:col-span-2"><Badge tone={METHOD_TONE[c.method]}>{c.method === "Manual" || c.method === "External" ? c.method : `${c.method}`}</Badge></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { CLOSED };
