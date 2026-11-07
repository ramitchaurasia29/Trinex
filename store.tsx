import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import {
  ALERTS, ARMED, BROKERS, CLOSED, HISTORY, POSITIONS,
  type AlertItem, type ArmedTool, type Broker, type BrokerId, type ClosedPosition, type HistoryEvent, type Position, type ToolId,
} from "./data";

export type MarketState = "pre" | "open" | "closing" | "closed" | "holiday";
export type Connectivity = "online" | "delayed" | "offline";
export type ToastTone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: ToastTone };

/** Work-in-progress tool configuration shared by Select → Configure → Review. */
export type Draft = {
  toolId: ToolId;
  positionId?: string;
  instrument?: string;
  config: Record<string, unknown>;
  editingId?: string;
};

type Store = {
  user: { name: string; phone: string; email: string; since: string };
  setUser: (u: Partial<Store["user"]>) => void;
  positions: Position[];
  closed: ClosedPosition[];
  brokers: Broker[];
  armed: ArmedTool[];
  alerts: AlertItem[];
  history: HistoryEvent[];
  market: MarketState;
  setMarket: (m: MarketState) => void;
  connectivity: Connectivity;
  setConnectivity: (c: Connectivity) => void;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  arm: (t: Omit<ArmedTool, "id" | "armedAt">, editingId?: string) => void;
  cancelArmed: (id: string) => void;
  closePosition: (id: string) => void;
  dismissAlert: (id: string) => void;
  markAlertsRead: () => void;
  setBrokerStatus: (id: BrokerId, status: Broker["status"]) => void;
  connectBroker: (id: BrokerId) => void;
  disconnectBroker: (id: BrokerId) => void;
  toast: (message: string, tone?: ToastTone) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState({ name: "Arjun Mehta", phone: "+91 98201 44718", email: "arjun.mehta@gmail.com", since: "12 Mar 2026" });
  const [positions, setPositions] = useState<Position[]>(POSITIONS);
  const [closed, setClosed] = useState<ClosedPosition[]>(CLOSED);
  const [brokers, setBrokers] = useState<Broker[]>(BROKERS);
  const [armed, setArmed] = useState<ArmedTool[]>(ARMED);
  const [alerts, setAlerts] = useState<AlertItem[]>(ALERTS);
  const [history] = useState<HistoryEvent[]>(HISTORY);
  const [market, setMarket] = useState<MarketState>("open");
  const [connectivity, setConnectivity] = useState<Connectivity>("online");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = seq.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const value = useMemo<Store>(() => ({
    user,
    setUser: (u) => setUserState((p) => ({ ...p, ...u })),
    positions, closed, brokers, armed, alerts, history,
    market, setMarket, connectivity, setConnectivity,
    draft, setDraft,
    arm: (t, editingId) => {
      if (editingId) {
        setArmed((a) => a.map((x) => (x.id === editingId ? { ...x, ...t } : x)));
      } else {
        setArmed((a) => [{ ...t, id: `a${Date.now()}`, armedAt: "Just now" }, ...a]);
      }
    },
    cancelArmed: (id) => setArmed((a) => a.filter((x) => x.id !== id)),
    closePosition: (id) => {
      const p = positions.find((x) => x.id === id);
      if (!p) return;
      setPositions((ps) => ps.filter((x) => x.id !== id));
      setArmed((a) => a.filter((x) => x.positionId !== id));
      const pnl = (p.ltp - p.avg) * p.qty * (p.side === "BUY" ? 1 : -1);
      setClosed((c) => [{
        id: `c${Date.now()}`, symbol: p.symbol, side: p.side, qtyLabel: p.kind === "stock" ? `${p.qty} shares` : `${Math.round(p.qty / p.lotSize)} lots`,
        entry: p.avg, exit: p.ltp, pnl, pct: ((p.ltp - p.avg) / p.avg) * 100 * (p.side === "BUY" ? 1 : -1), broker: p.broker, closedAt: "Just now", method: "Manual", day: "today",
      }, ...c]);
    },
    dismissAlert: (id) => setAlerts((a) => a.filter((x) => x.id !== id)),
    markAlertsRead: () => setAlerts((a) => a.map((x) => ({ ...x, unread: false }))),
    setBrokerStatus: (id, status) => setBrokers((b) => b.map((x) => (x.id === id ? { ...x, status } : x))),
    connectBroker: (id) => setBrokers((b) => b.map((x) => (x.id === id ? { ...x, status: "connected", lastSync: "Just now" } : x))),
    disconnectBroker: (id) => {
      setBrokers((b) => b.map((x) => (x.id === id ? { ...x, status: "disconnected", positions: 0, lastSync: undefined } : x)));
      const ids = positions.filter((p) => p.broker === id).map((p) => p.id);
      setPositions((ps) => ps.filter((p) => p.broker !== id));
      setArmed((a) => a.filter((x) => !x.positionId || !ids.includes(x.positionId)));
    },
    toast,
  }), [user, positions, closed, brokers, armed, alerts, history, market, connectivity, draft, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertTriangle : Info;
          return (
            <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-pop">
              <Icon size={18} strokeWidth={2} className={t.tone === "success" ? "text-profit-dot" : t.tone === "error" ? "text-loss-dot" : "text-info-line"} />
              <span className="font-medium">{t.message}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="ml-2 text-faint hover:text-white" aria-label="Dismiss">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
