import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Search, Inbox } from "lucide-react";
import AppShell from "../../AppShell";
import { INSTRUMENTS, isFO, num, pnlOf, pctOf, qtyLabel, toolById, type BrokerId } from "../../data";
import { BrokerTag, Button, Chip, EmptyState, Pnl, SideBadge, TextInput } from "../../ui";
import { FlowSteps, MobileBar, ToolHeaderCard } from "./FlowParts";
import { useFlow } from "./useFlow";
import { applyToolDefaults } from "../../tool-data";

export default function SelectTarget() {
  const { tool, toolId, mod, store, init, toolData } = useFlow();
  const nav = useNavigate();
  const [broker, setBroker] = useState<string | "all">("all");
  const [kind, setKind] = useState<"all" | "fo" | "stock">("all");
  const [selected, setSelected] = useState<string | undefined>(init.pos ?? init.inst);
  const [q, setQ] = useState("");

  if (tool.target === "self") return <Navigate to={`/tools/${toolId}/configure`} replace />;

  const go = () => {
    if (!selected) return;
    if (tool.target === "position") {
      const position = store.positions.find((p) => p.id === selected);
      store.setDraft({ toolId, positionId: selected, config: applyToolDefaults(toolId, mod.defaults({ position, positions: store.positions }), toolData.defaults) });
      nav(`/tools/${toolId}/configure?pos=${selected}`);
    } else {
      const apiInstrument = toolData.instruments.find((i) => i.display_symbol === selected);
      const instrument = INSTRUMENTS.find((i) => i.symbol === selected) ?? (apiInstrument ? { symbol: apiInstrument.display_symbol, exchange: apiInstrument.exchange, kind: apiInstrument.kind, ltp: 0, lotSize: Number(apiInstrument.lot_size), meta: `${apiInstrument.exchange} · PAPER catalogue` } : undefined);
      store.setDraft({ toolId, instrument: selected, instrumentId: apiInstrument?.id, config: applyToolDefaults(toolId, mod.defaults({ instrument, positions: store.positions }), toolData.defaults) });
      nav(`/tools/${toolId}/configure?inst=${encodeURIComponent(selected)}`);
    }
  };

  const cta = (
    <Button full size="lg" disabled={!selected} iconRight={ArrowRight} onClick={go}>
      Configure {tool.name}
    </Button>
  );

  const brokersWithPos = store.brokers.filter((b) => store.positions.some((p) => p.brokerAccountId === b.id));

  return (
    <AppShell title={tool.name} subtitle={tool.target === "position" ? "Choose a position" : "Choose an instrument"} back="/tools" flow width="narrow">
      <FlowSteps tool={tool} current={0} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {tool.target === "position" ? (
            <>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Which position should {tool.name} manage?</h2>
                <p className="mt-1 text-sm text-muted">One position per tool. You can add more tools to it later.</p>
              </div>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
                <Chip active={broker === "all"} onClick={() => setBroker("all")}>All brokers</Chip>
                {brokersWithPos.map((b) => (
                  <Chip key={b.id} active={broker === b.id} onClick={() => setBroker(b.id)}>{b.short}</Chip>
                ))}
                <span className="mx-1 w-px shrink-0 bg-line" />
                <Chip active={kind === "all"} onClick={() => setKind("all")}>All types</Chip>
                <Chip active={kind === "fo"} onClick={() => setKind("fo")}>F&amp;O</Chip>
                <Chip active={kind === "stock"} onClick={() => setKind("stock")}>Stocks</Chip>
              </div>
              {(() => {
                const list = store.positions.filter(
                  (p) => (broker === "all" || p.brokerAccountId === broker) && (kind === "all" || (kind === "fo" ? isFO(p.kind) : !isFO(p.kind))),
                );
                if (!store.positions.length) {
                  return <EmptyState icon={Inbox} title="No open positions" body="Connect a broker or open a position to use this tool." action={<Button onClick={() => nav("/more/brokers")}>Connect broker</Button>} />;
                }
                if (!list.length) return <EmptyState icon={Search} title="No positions match these filters" action={<Button variant="secondary" onClick={() => { setBroker("all"); setKind("all"); }}>Clear filters</Button>} />;
                return (
                  <div className="flex flex-col gap-2" role="radiogroup">
                    {list.map((p) => {
                      const already = store.armed.find((a) => a.positionId === p.id && a.toolId === toolId);
                      const active = selected === p.id;
                      return (
                        <button
                          key={p.id}
                          role="radio"
                          aria-checked={active}
                          disabled={!!already}
                          onClick={() => setSelected(p.id)}
                          className={[
                            "flex items-center gap-4 rounded-lg border bg-surface p-4 text-left disabled:cursor-not-allowed disabled:bg-surface-2",
                            active ? "border-primary ring-2 ring-primary-line" : "border-line hover:border-line-strong",
                          ].join(" ")}
                        >
                          <span className={["flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary" : "border-line-strong"].join(" ")}>
                            {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={["text-sm font-semibold tracking-tight", already ? "text-muted" : "text-ink"].join(" ")}>{p.symbol}</span>
                              <SideBadge side={p.side} />
                              <BrokerTag id={p.broker} />
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              {already ? `${tool.name} is already armed here — edit it from Positions.` : `${qtyLabel(p)} · ${p.product}${p.expiry ? ` · Exp ${p.expiry}` : ""}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm tabular-nums">₹{num(p.ltp)}</p>
                            <Pnl value={pnlOf(p)} pct={pctOf(p)} className="text-xs" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <div>
                <h2 className="text-base font-semibold tracking-tight">What do you want to enter?</h2>
                <p className="mt-1 text-sm text-muted">Search a stock, future or option contract.</p>
              </div>
              <TextInput value={q} onChange={setQ} placeholder="Search e.g. NIFTY 24500 CE, RELIANCE" prefix={<Search size={16} strokeWidth={2} />} />
              <div className="flex flex-col gap-2" role="radiogroup">
                {toolData.instruments.filter((i) => i.display_symbol.toLowerCase().includes(q.toLowerCase())).map((i) => {
                  const active = selected === i.display_symbol;
                  return (
                    <button
                      key={i.id}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelected(i.display_symbol)}
                      className={["flex items-center gap-4 rounded-lg border bg-surface p-4 text-left", active ? "border-primary ring-2 ring-primary-line" : "border-line hover:border-line-strong"].join(" ")}
                    >
                      <span className={["flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary" : "border-line-strong"].join(" ")}>
                        {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold tracking-tight">{i.display_symbol}</p>
                        <p className="mt-0.5 text-xs text-muted">{i.exchange} · {i.kind}{Number(i.lot_size) > 1 ? ` · Lot ${i.lot_size}` : ""}</p>
                      </div>
                      <p className="font-mono text-xs tabular-nums text-muted">PAPER</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-4">
            <ToolHeaderCard tool={toolById(toolId)} />
            {cta}
          </div>
        </aside>
      </div>
      <MobileBar cta={cta} />
    </AppShell>
  );
}
