import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LineChart, LayoutGrid, Bell, Menu, ArrowLeft, Clock3, Moon, Sunrise, CalendarOff, WifiOff, AlertTriangle, ChevronDown, Check, Plus, RefreshCw,
} from "lucide-react";
import { useStore, type MarketState, type Connectivity } from "./store";
import { useTradingData } from "./trading";
import { BrokerMark, Banner, Button } from "./ui";

const NAV = [
  { to: "/positions", label: "Positions", icon: LineChart, match: ["/positions", "/position/"] },
  { to: "/tools", label: "Tools", icon: LayoutGrid, match: ["/tools"] },
  { to: "/activity", label: "Activity", icon: Bell, match: ["/activity"] },
  { to: "/more", label: "More", icon: Menu, match: ["/more"] },
];

const MARKET: Record<MarketState, { label: string; dot: string; time: string }> = {
  pre: { label: "Pre-market", dot: "bg-warn-dot", time: "09:08 IST" },
  open: { label: "Market open", dot: "bg-profit-dot", time: "13:42 IST" },
  closing: { label: "Market closing", dot: "bg-warn-dot", time: "15:34 IST" },
  closed: { label: "Market closed", dot: "bg-faint", time: "18:05 IST" },
  holiday: { label: "Market holiday", dot: "bg-faint", time: "Bakri Id" },
};

export function MarketBanner() {
  const { market, connectivity, brokers, toast } = useStore();
  const trading = useTradingData();
  const broken = brokers.filter((b) => b.status === "expired" || b.status === "error");
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {connectivity === "delayed" && <Banner tone="warn" icon={AlertTriangle}>Live updates delayed · Data refreshing via API</Banner>}
      {market === "pre" && <Banner tone="warn" icon={Sunrise}>Pre-market session · Tools will activate at 9:15 AM</Banner>}
      {market === "closing" && <Banner tone="warn" icon={Clock3}>Market closing · Tool triggers paused</Banner>}
      {market === "closed" && <Banner tone="neutral" icon={Moon}>Market closed · Resumes Monday at 9:15 AM. You can still arm tools for the next session.</Banner>}
      {market === "holiday" && <Banner tone="neutral" icon={CalendarOff}>Market holiday · Bakri Id · Resumes 18 Jun</Banner>}
      {broken.map((b) => (
        <Banner
          key={b.id}
          tone={b.status === "error" ? "warn" : "loss"}
          icon={AlertTriangle}
          action={
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void trading.reconnect(b.id).then(() => toast(`${b.name} reconnected · paused tools require review`)).catch(() => toast(trading.error ?? "Reconnect failed", "error"))}>
              Reconnect
            </Button>
          }
        >
          {b.status === "error" ? `${b.name} API experiencing issues · Other brokers unaffected` : `${b.name} disconnected — tools paused. Reconnect to resume.`}
        </Banner>
      ))}
    </div>
  );
}

function SimulateMenu() {
  const { market, setMarket, connectivity, setConnectivity } = useStore();
  const [open, setOpen] = useState(false);
  const m = MARKET[market];
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-2 hover:border-line-strong">
        <span className={["h-2 w-2 rounded-full", m.dot].join(" ")} />
        {m.label}
        <span className="hidden font-mono text-muted sm:inline">{m.time}</span>
        <ChevronDown size={14} strokeWidth={2} className="text-faint" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-line bg-surface p-1.5 shadow-pop">
            <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-faint">Simulate market session</p>
            {(Object.keys(MARKET) as MarketState[]).map((k) => (
              <button key={k} onClick={() => { setMarket(k); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-surface-2">
                <span className={["h-2 w-2 rounded-full", MARKET[k].dot].join(" ")} />
                <span className="flex-1">{MARKET[k].label}</span>
                {market === k && <Check size={14} strokeWidth={2} className="text-primary" />}
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-faint">Simulate connection</p>
            {(["online", "delayed", "offline"] as Connectivity[]).map((k) => (
              <button key={k} onClick={() => { setConnectivity(k); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink capitalize hover:bg-surface-2">
                <span className="flex-1">{k === "delayed" ? "Live updates delayed" : k}</span>
                {connectivity === k && <Check size={14} strokeWidth={2} className="text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OfflineOverlay() {
  const { connectivity, setConnectivity } = useStore();
  if (connectivity !== "offline") return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-surface/95 p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-ink-2">
          <WifiOff size={26} strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">No internet connection</h2>
        <p className="mt-2 text-sm text-muted">Check your Wi-Fi or mobile data and try again. Your armed tools keep running on our servers.</p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-warn-soft px-2 py-1 text-xs font-medium text-warn"><AlertTriangle size={12} strokeWidth={2} /> Data may be stale</p>
        <div className="mt-6"><Button onClick={() => setConnectivity("online")} icon={RefreshCw}>Retry</Button></div>
      </div>
    </div>
  );
}

export default function AppShell({
  title, subtitle, actions, back, children, flow, width = "wide",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: string;
  children: ReactNode;
  /** Focused flow (tool setup): hides the mobile tab bar. */
  flow?: boolean;
  width?: "wide" | "narrow";
}) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { alerts, brokers, user } = useStore();
  const unread = alerts.filter((a) => a.unread).length;
  const connected = brokers.filter((b) => b.status !== "disconnected");

  return (
    <div className="min-h-screen bg-canvas lg:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <Link to="/positions" className="flex h-16 items-center gap-2.5 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-white"><Clock3 size={18} strokeWidth={2.25} /></span>
          <span className="text-base font-semibold tracking-tight">Timed Exit</span>
        </Link>
        <div className="px-3 pt-2">
          <Button full icon={Plus} onClick={() => nav("/tools")}>Arm a tool</Button>
        </div>
        <nav className="mt-4 flex flex-col gap-0.5 px-3">
          {NAV.map((n) => {
            const active = n.match.some((m) => pathname.startsWith(m));
            const Icon = n.icon;
            return (
              <Link key={n.to} to={n.to} className={["flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium", active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"].join(" ")}>
                <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
                <span className="flex-1">{n.label}</span>
                {n.to === "/activity" && unread > 0 && <span className="rounded-full bg-loss px-1.5 text-xs font-semibold text-white tabular-nums">{unread}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line p-4">
          <p className="mb-2 text-xs font-medium text-faint">Brokers</p>
          <div className="flex flex-col gap-1.5">
            {connected.map((b) => (
              <Link key={b.id} to="/more/brokers" className="flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
                <BrokerMark id={b.provider ?? b.id} />
                <span className="flex-1 truncate">{b.name}</span>
                <span className={["h-2 w-2 rounded-full", b.status === "connected" ? "bg-profit-dot" : b.status === "syncing" ? "bg-warn-dot" : b.status === "error" ? "bg-loss-dot" : "bg-faint"].join(" ")} />
              </Link>
            ))}
          </div>
          <Link to="/more/profile" className="mt-4 flex items-center gap-2.5 rounded-md border border-line p-2 hover:bg-surface-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">AM</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted">{user.phone}</span>
            </span>
          </Link>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className={["mx-auto flex h-14 items-center gap-3 px-4 lg:h-16 lg:px-8", width === "narrow" ? "max-w-5xl" : "max-w-7xl"].join(" ")}>
          {back && (
            <button onClick={() => nav(back)} aria-label="Back" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2">
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink lg:text-xl">{title}</h1>
            {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {actions}
            <SimulateMenu />
          </div>
        </div>
      </header>

      <main className={["mx-auto px-4 pt-4 lg:px-8 lg:pt-6", flow ? "pb-32 lg:pb-12" : "pb-28 lg:pb-12", width === "narrow" ? "max-w-5xl" : "max-w-7xl"].join(" ")}>
        <div className="mb-4 empty:hidden"><MarketBanner /></div>
        {children}
      </main>

      {/* Mobile tab bar */}
      {!flow && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t border-line bg-surface lg:hidden">
          {NAV.map((n) => {
            const active = n.match.some((m) => pathname.startsWith(m));
            const Icon = n.icon;
            return (
              <Link key={n.to} to={n.to} className={["relative flex flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-ink" : "text-faint"].join(" ")}>
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                {n.label}
                {n.to === "/activity" && unread > 0 && (
                  <span className="absolute top-2 left-1/2 ml-1 rounded-full bg-loss px-1 text-[10px] font-semibold leading-4 text-white">{unread}</span> // ds-ok: tab badge
                )}
              </Link>
            );
          })}
        </nav>
      )}
      <OfflineOverlay />
    </div>
  );
}
