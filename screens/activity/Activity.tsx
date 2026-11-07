import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity as ActivityIcon, AlertTriangle, Bell, CheckCircle2, Clock3, Download, Info, Search, X,
} from "lucide-react";
import AppShell from "../../AppShell";
import { ArmedToolCard, ArmedToolsSheet, CancelToolModal, editArmed, ToolPickerSheet } from "../../overlays";
import { CATEGORIES, TOOLS, toolById, type AlertItem, type ArmedTool } from "../../data";
import { useStore } from "../../store";
import { Badge, BrokerTag, Button, Card, Chip, EmptyState, Pnl, SectionTitle, Sheet, Tabs } from "../../ui";
import { useScreenInit } from "../../useScreenInit";

const ORDER = ["imminent", "active", "waiting", "queued", "paused", "failed"];
const BORDER: Record<string, string> = {
  imminent: "border-l-loss-dot", active: "border-l-profit-dot", waiting: "border-l-warn-dot",
  queued: "border-l-line-strong", paused: "border-l-line-strong", failed: "border-l-loss-dot",
};

export default function Activity() {
  const location = useLocation();
  const navigate = useNavigate();
  const { armed, alerts, history, positions, market, markAlertsRead, dismissAlert, setBrokerStatus, toast, setDraft } = useStore();
  const init = useScreenInit();
  const [category, setCategory] = useState<string>(typeof init.filter === "string" ? init.filter : "all");
  const [toolFilter, setToolFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pickedPositionId, setPickedPositionId] = useState<string | null>(null);
  const [pickerPositionId, setPickerPositionId] = useState<string | null>(null);
  const [pickedTool, setPickedTool] = useState<ArmedTool | null>(null);
  const [cancelTool, setCancelTool] = useState<ArmedTool | null>(null);
  const [empty] = useState(Boolean(init.empty));
  const tab = location.pathname.endsWith("/history") ? "history" : location.pathname.endsWith("/alerts") ? "alerts" : "live";

  useEffect(() => {
    if (tab === "alerts") markAlertsRead();
  }, [tab, markAlertsRead]);

  const visibleArmed = useMemo(() => {
    const list = empty ? [] : armed;
    return list
      .filter((item) => category === "all" || toolById(item.toolId).category === category)
      .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  }, [armed, category, empty]);
  const activeCount = empty ? 0 : armed.length;
  const unreadCount = empty ? 0 : alerts.filter((a) => a.unread).length;

  const openTool = (item: ArmedTool) => {
    if (item.positionId && positions.some((p) => p.id === item.positionId)) setPickedPositionId(item.positionId);
    else setPickedTool(item);
  };

  const onAlertAction = (item: AlertItem) => {
    if (item.action === "Retry") {
      toast("Retrying… order placed", "info");
      dismissAlert(item.id);
    } else if (item.action === "Reconnect") {
      setBrokerStatus("angel", "connected");
      toast("Angel One reconnected");
    } else if (item.action === "View") {
      navigate("/positions/armed");
    } else dismissAlert(item.id);
  };

  const eventList = useMemo(() => {
    const filtered = (empty ? [] : history).filter((event) => {
      const byTool = toolFilter === "all" || event.toolId === toolFilter;
      const byDay = dateFilter === "all" || (dateFilter === "today" ? event.day === "Today" : dateFilter === "yesterday" ? event.day === "Yesterday" : true);
      const bySearch = !search || event.instrument.toLowerCase().includes(search.toLowerCase()) || event.text.toLowerCase().includes(search.toLowerCase());
      return byTool && byDay && bySearch;
    });
    return filtered;
  }, [dateFilter, empty, history, search, toolFilter]);

  const exportHistory = () => toast("History exported · 9 events");

  return (
    <AppShell title="Activity" subtitle="Your tools, executions and alerts">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          value={tab}
          onChange={(value) => navigate(value === "live" ? "/activity" : `/activity/${value}`)}
          items={[
            { value: "live", label: "Live", count: activeCount },
            { value: "history", label: "History" },
            { value: "alerts", label: "Alerts", count: unreadCount || undefined },
          ]}
        />
      </div>

      {tab === "live" && (
        <section>
          {(market === "closed" || market === "holiday") ? (
            <div className="mb-4 rounded-lg border border-line bg-surface px-4 py-3">
              <p className="text-sm font-semibold tracking-tight text-ink">No active monitoring · Next session Monday 9:15 AM</p>
              <p className="mt-1 text-xs text-muted">Your tools are ready and will resume when the market opens.</p>
            </div>
          ) : market === "pre" ? (
            <div className="mb-4 rounded-lg border border-warn-line bg-warn-soft px-4 py-3 text-sm font-medium text-warn">Activates at market open</div>
          ) : null}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-ink-2"><span className="font-mono tabular-nums">{visibleArmed.length}</span> tools active</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <Chip active={category === "all"} onClick={() => setCategory("all")}>All</Chip>
              {CATEGORIES.map((item) => <Chip key={item.id} active={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</Chip>)}
            </div>
          </div>
          {visibleArmed.length === 0 ? (
            <EmptyState icon={ActivityIcon} title="No active tools. Arm a tool from the Positions or Tools tab." action={<Button onClick={() => navigate("/tools")}>Explore tools</Button>} />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleArmed.map((item) => {
                const tool = toolById(item.toolId);
                const Icon = tool.icon;
                const position = positions.find((p) => p.id === item.positionId);
                return (
                  <button key={item.id} type="button" onClick={() => openTool(item)} className={`rounded-lg border border-line border-l-4 ${BORDER[item.status] ?? "border-l-line-strong"} bg-surface p-4 text-left shadow-card hover:border-line-strong`}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2"><Icon size={18} strokeWidth={2} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold tracking-tight text-ink">{tool.name}</span>
                          <Badge tone={item.status === "imminent" || item.status === "failed" ? "loss" : item.status === "active" ? "profit" : item.status === "waiting" ? "warn" : item.status === "queued" ? "info" : "neutral"} dot>{item.statusText}</Badge>
                        </div>
                        <p className="mt-1 truncate text-sm text-ink-2">{position ? <><span className="font-medium">{position.symbol}</span> · {position.side} · {position.qty} qty</> : item.target}</p>
                        <p className="mt-2 text-sm text-muted">{item.summary}</p>
                        {item.metric && <div className="mt-3">
                          <div className="flex items-center justify-between text-xs"><span className="text-muted">{item.metric.label}</span><span className="font-mono font-medium tabular-nums text-ink">{item.metric.value}</span></div>
                          {item.metric.progress !== undefined && <progress aria-label={`${item.metric.label} progress`} value={item.metric.progress} max={1} className="mt-2 h-1.5 w-full overflow-hidden rounded-full accent-primary" />}
                        </div>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "history" && (
        <section>
          <Card className="mb-4" padded={false}>
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-3 sm:divide-x sm:divide-line">
              <div><p className="text-xs text-muted">Exits today</p><p className="mt-1 text-sm font-semibold tracking-tight">6 <span className="font-normal text-muted">· 4 by tools</span></p></div>
              <div className="sm:pl-4"><p className="text-xs text-muted">Tool-assisted P&amp;L</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums text-profit">+₹5,252</p></div>
              <div className="flex items-center justify-start sm:justify-end"><Button variant="secondary" size="sm" icon={Download} onClick={exportHistory}>Export to CSV</Button></div>
            </div>
          </Card>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {[{id:"all",label:"All dates"},{id:"today",label:"Today"},{id:"yesterday",label:"Yesterday"},{id:"week",label:"This week"}].map((item) => <Chip key={item.id} active={dateFilter === item.id} onClick={() => setDateFilter(item.id)}>{item.label}</Chip>)}
            </div>
            <label className="flex h-9 min-w-48 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 lg:ml-auto"><Search size={15} strokeWidth={2} className="text-faint" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search instrument" className="w-full bg-transparent text-sm outline-none placeholder:text-faint" /></label>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <Chip active={toolFilter === "all"} onClick={() => setToolFilter("all")}>All tools</Chip>
            {TOOLS.map((tool) => <Chip key={tool.id} active={toolFilter === tool.id} onClick={() => setToolFilter(tool.id)}>{tool.name}</Chip>)}
          </div>
          {eventList.length === 0 ? <EmptyState icon={Clock3} title="No tool executions yet. History appears as your tools trigger." /> : (
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {(["Today", "Yesterday"] as const).map((day) => {
                const dayEvents = eventList.filter((event) => event.day === day);
                if (!dayEvents.length) return null;
                return <div key={day}>
                  <div className="border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">{day}</div>
                  <div className="divide-y divide-line">
                    {dayEvents.map((event) => {
                      const Icon = toolById(event.toolId).icon;
                      return <div key={event.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                        <span className="font-mono text-xs tabular-nums text-muted">{event.time}</span>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2"><Icon size={16} strokeWidth={2} /></span>
                        <p className="min-w-0 flex-1 text-sm text-ink-2">{event.text}</p>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">{event.impact !== undefined && <Pnl value={event.impact} className="text-sm" />}<BrokerTag id={event.broker} /></div>
                      </div>;
                    })}
                  </div>
                </div>;
              })}
            </div>
          )}
        </section>
      )}

      {tab === "alerts" && (
        <AlertsContent alerts={empty ? [] : alerts} onAction={onAlertAction} onDismiss={dismissAlert} />
      )}

      <ArmedToolsSheet position={positions.find((p) => p.id === pickedPositionId) ?? null} onClose={() => setPickedPositionId(null)} onAdd={(position) => { setPickedPositionId(null); setPickerPositionId(position.id); }} />
      <ToolPickerSheet position={positions.find((p) => p.id === pickerPositionId) ?? null} onClose={() => setPickerPositionId(null)} />
      <Sheet open={Boolean(pickedTool)} onClose={() => setPickedTool(null)} title={pickedTool ? toolById(pickedTool.toolId).name : "Tool details"} subtitle={pickedTool?.target}>
        {pickedTool && <ArmedToolCard a={pickedTool} onEdit={() => { const value = pickedTool; setPickedTool(null); editArmed(navigate, setDraft, positions, value); }} onCancel={() => setCancelTool(pickedTool)} />}
      </Sheet>
      <CancelToolModal tool={cancelTool} onClose={() => { setCancelTool(null); setPickedTool(null); }} />
    </AppShell>
  );
}

function AlertsContent({ alerts, onAction, onDismiss }: { alerts: AlertItem[]; onAction: (item: AlertItem) => void; onDismiss: (id: string) => void }) {
  const attention = alerts.filter((item) => item.severity === "critical" || item.severity === "warning");
  const updates = alerts.filter((item) => item.severity === "success" || item.severity === "info");
  if (!alerts.length) return <EmptyState icon={Bell} title="You're all caught up." />;
  return <div className="flex flex-col gap-6">
    {[{title:"Needs attention",items:attention},{title:"Updates",items:updates}].map((group) => group.items.length > 0 && <section key={group.title}>
      <SectionTitle>{group.title}</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {group.items.map((item) => {
          const tone = item.severity === "critical" ? "loss" : item.severity === "warning" ? "warn" : item.severity === "success" ? "profit" : "info";
          const Icon = item.severity === "critical" || item.severity === "warning" ? AlertTriangle : item.severity === "success" ? CheckCircle2 : Info;
          return <Card key={item.id} className={item.unread ? "border-primary-line bg-primary-soft/30" : ""}>
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone === "loss" ? "bg-loss-soft text-loss" : tone === "warn" ? "bg-warn-soft text-warn" : tone === "profit" ? "bg-profit-soft text-profit" : "bg-info-soft text-info"}`}><Icon size={18} strokeWidth={2} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2"><h3 className="flex-1 text-sm font-semibold tracking-tight text-ink">{item.title}</h3>{item.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}</div>
                <p className="mt-1 text-sm text-ink-2">{item.body}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-xs tabular-nums text-muted">{item.time}</span>
                  <div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => onAction(item)}>{item.action}</Button><button aria-label="Dismiss alert" onClick={() => onDismiss(item.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><X size={16} strokeWidth={2} /></button></div>
                </div>
              </div>
            </div>
          </Card>;
        })}
      </div>
    </section>)}
  </div>;
}
