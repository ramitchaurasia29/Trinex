import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ApiError,
  connectBrokerAccount,
  disconnectBrokerAccount,
  getBrokerAccounts,
  getPosition,
  getPositions,
  reconnectBrokerAccount,
  syncAllBrokerAccounts,
  syncBrokerAccount,
  type BrokerAccountApi,
  type PositionApi,
  type SyncResultApi,
} from "./api";
import { useAuth } from "./auth";
import { type Broker, type BrokerId, type ClosedPosition, type ExitMethod, type Position } from "./data";
import { useStore } from "./store";

type TradingContextValue = {
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  refresh: () => Promise<void>;
  connect: (provider: BrokerId, requestId?: string) => Promise<void>;
  reconnect: (accountId: string) => Promise<void>;
  syncAccount: (accountId: string) => Promise<SyncResultApi>;
  syncAll: () => Promise<SyncResultApi[]>;
  disconnect: (accountId: string) => Promise<{ retained_positions: number; paused_tools: number }>;
  fetchPosition: (id: string) => Promise<Position>;
};

const Context = createContext<TradingContextValue | null>(null);
const number = (value: string | null | undefined) => Number(value ?? 0);
const provider = (value: string) => value as BrokerId;
const relative = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : undefined;

function brokerView(account: BrokerAccountApi): Broker {
  return { id: account.id, provider: provider(account.provider), name: account.display_name, short: account.display_name, mono: "M", status: account.status, lastSync: relative(account.last_synced_at), positions: account.position_count, dataMode: "SIMULATED" };
}

export function positionView(item: PositionApi): Position {
  const greeks = Object.keys(item.greeks).length ? {
    delta: number(String(item.greeks.delta ?? 0)), gamma: number(String(item.greeks.gamma ?? 0)), theta: number(String(item.greeks.theta ?? 0)), vega: number(String(item.greeks.vega ?? 0)), iv: number(String(item.greeks.iv ?? 0)),
  } : undefined;
  return {
    id: item.id, symbol: item.symbol, exchange: item.exchange as Position["exchange"], kind: item.kind, side: item.side,
    qty: number(item.quantity), lotSize: number(item.lot_size), avg: number(item.average_entry_price), ltp: number(item.ltp),
    prevClose: number(item.previous_close), open: number(item.day_open), dayLow: number(item.day_low), dayHigh: number(item.day_high),
    product: item.product, expiry: item.expiry_date ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(`${item.expiry_date}T00:00:00`)) : undefined,
    broker: provider(item.broker_provider), brokerAccountId: item.broker_account_id, since: `Since ${relative(item.opened_at) ?? "—"}`,
    greeks, marginUsed: number(item.margin_used), marginAvailable: number(item.margin_available), realizedPnl: number(item.realized_pnl), stale: item.stale, dataMode: "SIMULATED",
  };
}

function closedView(item: PositionApi): ClosedPosition {
  const when = item.closed_at ? new Date(item.closed_at) : new Date();
  const today = new Date();
  const day: ClosedPosition["day"] = when.toDateString() === today.toDateString() ? "today" : (today.getTime() - when.getTime()) < 172800000 ? "yesterday" : "week";
  const lots = number(item.lot_size) > 1 ? `${Math.round(number(item.quantity) / number(item.lot_size))} lots` : `${number(item.quantity)} shares`;
  return { id: item.id, symbol: item.symbol, side: item.side, qtyLabel: lots, entry: number(item.average_entry_price), exit: number(item.ltp), pnl: number(item.realized_pnl), pct: number(item.pnl_percentage), broker: provider(item.broker_provider), brokerAccountId: item.broker_account_id, closedAt: relative(item.closed_at) ?? "—", method: (item.exit_method ?? "External") as ExitMethod, day, dataMode: "SIMULATED" };
}

export function TradingDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { replaceBrokers, replacePositions, replaceClosed } = useStore();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const fixture = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("figr_screen");

  const refresh = useCallback(async () => {
    if (!user || fixture) return;
    setLoading(true); setError(null);
    try {
      const [accounts, open, closed] = await Promise.all([getBrokerAccounts(), getPositions("open"), getPositions("closed")]);
      replaceBrokers(accounts.map(brokerView));
      replacePositions(open.items.map(positionView));
      replaceClosed(closed.items.map(closedView));
      setLastSyncedAt(open.last_synced_at ?? closed.last_synced_at);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load broker data");
    } finally { setLoading(false); }
  }, [user, fixture, replaceBrokers, replacePositions, replaceClosed]);

  useEffect(() => { void refresh(); }, [refresh]);
  const withSync = useCallback(async <T,>(work: () => Promise<T>) => { setSyncing(true); setError(null); try { const result = await work(); await refresh(); return result; } catch (cause) { const message = cause instanceof ApiError ? cause.message : "Broker operation failed"; setError(message); throw cause; } finally { setSyncing(false); } }, [refresh]);
  const value = useMemo<TradingContextValue>(() => ({
    loading, syncing, error, lastSyncedAt, refresh,
    connect: (p, requestId = crypto.randomUUID()) => withSync(async () => { await connectBrokerAccount(p, requestId); }),
    reconnect: (id) => withSync(async () => { await reconnectBrokerAccount(id); }),
    syncAccount: (id) => withSync(() => syncBrokerAccount(id)),
    syncAll: () => withSync(async () => (await syncAllBrokerAccounts()).results),
    disconnect: (id) => withSync(() => disconnectBrokerAccount(id)),
    fetchPosition: async (id) => positionView((await getPosition(id)).position),
  }), [loading, syncing, error, lastSyncedAt, refresh, withSync]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTradingData() {
  const value = useContext(Context);
  if (!value) throw new Error("useTradingData outside TradingDataProvider");
  return value;
}
