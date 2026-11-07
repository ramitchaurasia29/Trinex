import {
  Clock,
  TrendingUp,
  CalendarClock,
  Hourglass,
  SplitSquareHorizontal,
  Target,
  ShieldCheck,
  GitBranch,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Brokers                                                             */
/* ------------------------------------------------------------------ */

export type BrokerId =
  | "zerodha"
  | "angel"
  | "dhan"
  | "groww"
  | "upstox"
  | "icici"
  | "kotak"
  | "5paisa"
  | "hdfc"
  | "motilal"
  | "shoonya";

export type BrokerStatus = "connected" | "syncing" | "error" | "expired" | "disconnected";

export type Broker = {
  id: BrokerId;
  name: string;
  short: string;
  mono: string;
  status: BrokerStatus;
  lastSync?: string;
  positions: number;
};

export const BROKERS: Broker[] = [
  { id: "zerodha", name: "Zerodha", short: "Zerodha", mono: "Z", status: "connected", lastSync: "2s ago", positions: 5 },
  { id: "angel", name: "Angel One", short: "Angel", mono: "A", status: "connected", lastSync: "3s ago", positions: 2 },
  { id: "dhan", name: "Dhan", short: "Dhan", mono: "D", status: "connected", lastSync: "1s ago", positions: 1 },
  { id: "groww", name: "Groww", short: "Groww", mono: "G", status: "disconnected", positions: 0 },
  { id: "upstox", name: "Upstox", short: "Upstox", mono: "U", status: "disconnected", positions: 0 },
  { id: "icici", name: "ICICI Direct", short: "ICICI", mono: "I", status: "disconnected", positions: 0 },
  { id: "kotak", name: "Kotak Neo", short: "Kotak", mono: "K", status: "disconnected", positions: 0 },
  { id: "5paisa", name: "5Paisa", short: "5Paisa", mono: "5", status: "disconnected", positions: 0 },
  { id: "hdfc", name: "HDFC Securities", short: "HDFC", mono: "H", status: "disconnected", positions: 0 },
  { id: "motilal", name: "Motilal Oswal", short: "Motilal", mono: "M", status: "disconnected", positions: 0 },
  { id: "shoonya", name: "Shoonya (Finvasia)", short: "Shoonya", mono: "S", status: "disconnected", positions: 0 },
];

/* ------------------------------------------------------------------ */
/* Positions                                                           */
/* ------------------------------------------------------------------ */

export type InstrumentKind = "option" | "future" | "stock";
export type Side = "BUY" | "SELL";

export type Position = {
  id: string;
  symbol: string;
  exchange: "NFO" | "NSE" | "BSE";
  kind: InstrumentKind;
  side: Side;
  qty: number;
  lotSize: number;
  avg: number;
  ltp: number;
  prevClose: number;
  open: number;
  dayLow: number;
  dayHigh: number;
  product: "MIS" | "NRML" | "CNC";
  expiry?: string;
  broker: BrokerId;
  since: string;
  greeks?: { delta: number; gamma: number; theta: number; vega: number; iv: number };
  marginUsed: number;
  marginAvailable: number;
};

export const POSITIONS: Position[] = [
  {
    id: "p1", symbol: "NIFTY 24500 CE", exchange: "NFO", kind: "option", side: "BUY", qty: 150, lotSize: 75,
    avg: 182.4, ltp: 214.65, prevClose: 176.2, open: 179.0, dayLow: 168.3, dayHigh: 226.1, product: "NRML",
    expiry: "26 Jun", broker: "zerodha", since: "Since 10:42 AM",
    greeks: { delta: 0.54, gamma: 0.0021, theta: -11.8, vega: 9.4, iv: 13.6 }, marginUsed: 27360, marginAvailable: 184210,
  },
  {
    id: "p2", symbol: "BANKNIFTY 52000 PE", exchange: "NFO", kind: "option", side: "SELL", qty: 35, lotSize: 35,
    avg: 318.0, ltp: 286.4, prevClose: 331.5, open: 325.0, dayLow: 279.2, dayHigh: 341.0, product: "NRML",
    expiry: "26 Jun", broker: "zerodha", since: "Since 09:31 AM",
    greeks: { delta: -0.41, gamma: 0.0009, theta: -24.2, vega: 18.1, iv: 15.2 }, marginUsed: 142800, marginAvailable: 184210,
  },
  {
    id: "p3", symbol: "RELIANCE", exchange: "NSE", kind: "stock", side: "BUY", qty: 200, lotSize: 1,
    avg: 1428.0, ltp: 1430.35, prevClose: 1422.9, open: 1425.0, dayLow: 1418.6, dayHigh: 1436.8, product: "MIS",
    broker: "angel", since: "Since 09:52 AM", marginUsed: 57140, marginAvailable: 96420,
  },
  {
    id: "p4", symbol: "HDFCBANK", exchange: "NSE", kind: "stock", side: "SELL", qty: 150, lotSize: 1,
    avg: 1712.5, ltp: 1698.2, prevClose: 1719.4, open: 1716.0, dayLow: 1694.0, dayHigh: 1721.3, product: "MIS",
    broker: "zerodha", since: "Since 11:05 AM", marginUsed: 51375, marginAvailable: 184210,
  },
  {
    id: "p5", symbol: "NIFTY JUN FUT", exchange: "NFO", kind: "future", side: "BUY", qty: 75, lotSize: 75,
    avg: 24482.0, ltp: 24538.6, prevClose: 24451.0, open: 24470.0, dayLow: 24428.0, dayHigh: 24561.0, product: "NRML",
    expiry: "26 Jun", broker: "dhan", since: "Day 3", marginUsed: 118400, marginAvailable: 62300,
  },
  {
    id: "p6", symbol: "TATAMOTORS", exchange: "NSE", kind: "stock", side: "BUY", qty: 500, lotSize: 1,
    avg: 742.1, ltp: 736.85, prevClose: 739.2, open: 740.0, dayLow: 733.5, dayHigh: 745.6, product: "CNC",
    broker: "angel", since: "Day 6", marginUsed: 371050, marginAvailable: 96420,
  },
  {
    id: "p7", symbol: "FINNIFTY 23800 CE", exchange: "NFO", kind: "option", side: "BUY", qty: 195, lotSize: 65,
    avg: 96.2, ltp: 118.4, prevClose: 92.0, open: 94.5, dayLow: 88.0, dayHigh: 121.9, product: "NRML",
    expiry: "24 Jun", broker: "zerodha", since: "Since 10:12 AM",
    greeks: { delta: 0.48, gamma: 0.0034, theta: -8.1, vega: 6.2, iv: 14.1 }, marginUsed: 18759, marginAvailable: 184210,
  },
  {
    id: "p8", symbol: "INFY", exchange: "NSE", kind: "stock", side: "BUY", qty: 100, lotSize: 1,
    avg: 1586.0, ltp: 1571.4, prevClose: 1590.2, open: 1588.0, dayLow: 1566.2, dayHigh: 1592.4, product: "MIS",
    broker: "zerodha", since: "Since 12:20 PM", marginUsed: 31720, marginAvailable: 184210,
  },
];

export type ExitMethod = "Manual" | "Timed Exit" | "SL Hit" | "Target Hit" | "Auto-Close" | "External" | "Range Break" | "No-Motion" | "MTM Lock";

export type ClosedPosition = {
  id: string;
  symbol: string;
  side: Side;
  qtyLabel: string;
  entry: number;
  exit: number;
  pnl: number;
  pct: number;
  broker: BrokerId;
  closedAt: string;
  method: ExitMethod;
  day: "today" | "yesterday" | "week";
};

export const CLOSED: ClosedPosition[] = [
  { id: "c1", symbol: "NIFTY 24400 PE", side: "BUY", qtyLabel: "2 lots", entry: 142.5, exit: 168.2, pnl: 3855, pct: 18.0, broker: "zerodha", closedAt: "12:48 PM", method: "Target Hit", day: "today" },
  { id: "c2", symbol: "SBIN", side: "BUY", qtyLabel: "300 shares", entry: 812.4, exit: 806.1, pnl: -1890, pct: -0.8, broker: "angel", closedAt: "12:15 PM", method: "No-Motion", day: "today" },
  { id: "c3", symbol: "BANKNIFTY 51800 CE", side: "SELL", qtyLabel: "1 lot", entry: 288.0, exit: 241.5, pnl: 1627, pct: 16.1, broker: "zerodha", closedAt: "11:57 AM", method: "Timed Exit", day: "today" },
  { id: "c4", symbol: "ICICIBANK", side: "SELL", qtyLabel: "120 shares", entry: 1241.0, exit: 1252.6, pnl: -1392, pct: -0.9, broker: "zerodha", closedAt: "11:22 AM", method: "SL Hit", day: "today" },
  { id: "c5", symbol: "NIFTY 24450 CE", side: "BUY", qtyLabel: "1 lot", entry: 120.0, exit: 131.8, pnl: 885, pct: 9.8, broker: "dhan", closedAt: "10:41 AM", method: "Manual", day: "today" },
  { id: "c6", symbol: "AXISBANK", side: "BUY", qtyLabel: "200 shares", entry: 1176.0, exit: 1184.3, pnl: 1660, pct: 0.7, broker: "angel", closedAt: "10:18 AM", method: "Range Break", day: "today" },
  { id: "c7", symbol: "LT", side: "BUY", qtyLabel: "50 shares", entry: 3612.0, exit: 3641.5, pnl: 1475, pct: 0.8, broker: "zerodha", closedAt: "3:10 PM", method: "Auto-Close", day: "yesterday" },
  { id: "c8", symbol: "FINNIFTY 23700 PE", side: "BUY", qtyLabel: "2 lots", entry: 88.0, exit: 64.3, pnl: -3081, pct: -26.9, broker: "zerodha", closedAt: "2:44 PM", method: "SL Hit", day: "yesterday" },
  { id: "c9", symbol: "WIPRO", side: "SELL", qtyLabel: "400 shares", entry: 291.4, exit: 287.2, pnl: 1680, pct: 1.4, broker: "angel", closedAt: "1:02 PM", method: "MTM Lock", day: "yesterday" },
  { id: "c10", symbol: "MARUTI", side: "BUY", qtyLabel: "10 shares", entry: 12480, exit: 12396, pnl: -840, pct: -0.7, broker: "dhan", closedAt: "Mon 2:10 PM", method: "External", day: "week" },
  { id: "c11", symbol: "NIFTY 24300 CE", side: "BUY", qtyLabel: "3 lots", entry: 98.0, exit: 132.6, pnl: 7785, pct: 35.3, broker: "zerodha", closedAt: "Mon 11:30 AM", method: "Target Hit", day: "week" },
];

/* ------------------------------------------------------------------ */
/* Instruments (for entry / dependency pickers)                        */
/* ------------------------------------------------------------------ */

export type Instrument = { symbol: string; exchange: string; kind: InstrumentKind; ltp: number; lotSize: number; meta: string };

export const INSTRUMENTS: Instrument[] = [
  { symbol: "NIFTY", exchange: "NSE", kind: "stock", ltp: 24512.4, lotSize: 1, meta: "Index" },
  { symbol: "BANKNIFTY", exchange: "NSE", kind: "stock", ltp: 52148.9, lotSize: 1, meta: "Index" },
  { symbol: "FINNIFTY", exchange: "NSE", kind: "stock", ltp: 23842.1, lotSize: 1, meta: "Index" },
  { symbol: "NIFTY 24500 CE", exchange: "NFO", kind: "option", ltp: 214.65, lotSize: 75, meta: "NFO · 26 Jun · CE" },
  { symbol: "NIFTY 24500 PE", exchange: "NFO", kind: "option", ltp: 166.1, lotSize: 75, meta: "NFO · 26 Jun · PE" },
  { symbol: "BANKNIFTY 52000 CE", exchange: "NFO", kind: "option", ltp: 412.3, lotSize: 35, meta: "NFO · 26 Jun · CE" },
  { symbol: "BANKNIFTY 52000 PE", exchange: "NFO", kind: "option", ltp: 286.4, lotSize: 35, meta: "NFO · 26 Jun · PE" },
  { symbol: "NIFTY JUN FUT", exchange: "NFO", kind: "future", ltp: 24538.6, lotSize: 75, meta: "NFO · 26 Jun · FUT" },
  { symbol: "RELIANCE", exchange: "NSE", kind: "stock", ltp: 1430.35, lotSize: 1, meta: "NSE · EQ" },
  { symbol: "HDFCBANK", exchange: "NSE", kind: "stock", ltp: 1698.2, lotSize: 1, meta: "NSE · EQ" },
  { symbol: "INFY", exchange: "NSE", kind: "stock", ltp: 1571.4, lotSize: 1, meta: "NSE · EQ" },
  { symbol: "TCS", exchange: "NSE", kind: "stock", ltp: 3912.0, lotSize: 1, meta: "NSE · EQ" },
  { symbol: "SBIN", exchange: "NSE", kind: "stock", ltp: 808.25, lotSize: 1, meta: "NSE · EQ" },
];

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

export type ToolId =
  | "timed-exit"
  | "trailing-sl"
  | "timed-entry"
  | "no-motion"
  | "range-break"
  | "partial-profit"
  | "mtm-lock"
  | "dependency";

export type CategoryId = "time" | "protect" | "price" | "conditions";

export const CATEGORIES: { id: CategoryId; name: string; blurb: string }[] = [
  { id: "time", name: "Time", blurb: "Enter or exit at a clock time" },
  { id: "protect", name: "Stop-loss & Targets", blurb: "Trail risk, book profit in steps" },
  { id: "price", name: "Price Action", blurb: "React to how price behaves" },
  { id: "conditions", name: "Risk & Conditions", blurb: "Protect MTM, link instruments" },
];

/** How the tool picks what it acts on. */
export type ToolTarget = "position" | "instrument" | "self";

export type ToolDef = {
  id: ToolId;
  name: string;
  description: string;
  how: string;
  category: CategoryId;
  icon: LucideIcon;
  target: ToolTarget;
};

export const TOOLS: ToolDef[] = [
  {
    id: "timed-exit", name: "Timed Exit", category: "time", icon: Clock, target: "position",
    description: "Exit a position at an exact time — before the broker's 3:15 square-off.",
    how: "At your time → exits full or part of the position",
  },
  {
    id: "timed-entry", name: "Time-Based Entry", category: "time", icon: CalendarClock, target: "instrument",
    description: "Enter at a set time, in one go or as a ladder of timed entries.",
    how: "At each time → places the entry you set",
  },
  {
    id: "trailing-sl", name: "Auto Trailing SL", category: "protect", icon: TrendingUp, target: "position",
    description: "Move your stop-loss up as price moves in your favour.",
    how: "Every X move in your favour → SL moves by Y",
  },
  {
    id: "partial-profit", name: "Partial Profit Book", category: "protect", icon: Target, target: "position",
    description: "Book profit in steps at up to 5 target levels.",
    how: "At each target → exits a part, carries the rest",
  },
  {
    id: "no-motion", name: "No-Motion Exit", category: "price", icon: Hourglass, target: "position",
    description: "Get out of trades that stop moving within a time window.",
    how: "If price doesn't move enough in the window → exits",
  },
  {
    id: "range-break", name: "Range Break Exit", category: "price", icon: SplitSquareHorizontal, target: "position",
    description: "Exit when price breaks a high or low level you define.",
    how: "When price breaks your level → exits full or part",
  },
  {
    id: "mtm-lock", name: "MTM Lock", category: "conditions", icon: ShieldCheck, target: "self",
    description: "Lock in profit once MTM reaches a level — with optional progressive locks.",
    how: "Once MTM hits target → protects a profit floor",
  },
  {
    id: "dependency", name: "Dependency Entry / Exit", category: "conditions", icon: GitBranch, target: "self",
    description: "If one instrument crosses a level, enter or exit another.",
    how: "When A crosses a level → enters or exits B",
  },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id) as ToolDef;

/* ------------------------------------------------------------------ */
/* Armed tool instances                                                */
/* ------------------------------------------------------------------ */

export type ArmedStatus = "waiting" | "active" | "imminent" | "paused" | "queued" | "failed";

export type ArmedTool = {
  id: string;
  toolId: ToolId;
  positionId?: string;
  target: string;
  summary: string;
  status: ArmedStatus;
  statusText: string;
  metric?: { label: string; value: string; progress?: number };
  armedAt: string;
  config?: Record<string, unknown>;
};

export const ARMED: ArmedTool[] = [
  {
    id: "a1", toolId: "timed-exit", positionId: "p1", target: "NIFTY 24500 CE", summary: "Exit 100% at 15:10",
    status: "waiting", statusText: "Fires in 1h 28m", metric: { label: "Exit at", value: "15:10", progress: 0.62 }, armedAt: "10:44 AM",
  },
  {
    id: "a2", toolId: "trailing-sl", positionId: "p5", target: "NIFTY JUN FUT", summary: "+20 pts → SL +10 pts",
    status: "active", statusText: "Trailing", metric: { label: "SL", value: "₹24,470 → ₹24,500" }, armedAt: "09:20 AM",
  },
  {
    id: "a3", toolId: "no-motion", positionId: "p3", target: "RELIANCE", summary: "Move 5 pts by 14:00",
    status: "imminent", statusText: "Window ends in 3 min", metric: { label: "Moved", value: "2.35 of 5 pts", progress: 0.47 }, armedAt: "13:00 PM",
  },
  {
    id: "a4", toolId: "partial-profit", positionId: "p7", target: "FINNIFTY 23800 CE", summary: "3 targets · ₹125 / ₹140 / ₹160",
    status: "waiting", statusText: "Target 1 at ₹125", metric: { label: "To T1", value: "₹6.60 away", progress: 0.77 }, armedAt: "10:15 AM",
  },
  {
    id: "a5", toolId: "mtm-lock", target: "NIFTY 24500 CE + FINNIFTY 23800 CE", summary: "At ₹5,000 → protect ₹3,500",
    status: "active", statusText: "Lock active", metric: { label: "MTM", value: "₹9,167 · floor ₹3,500", progress: 1 }, armedAt: "10:20 AM",
  },
];

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export type HistoryEvent = {
  id: string;
  time: string;
  day: "Today" | "Yesterday";
  toolId: ToolId;
  text: string;
  impact?: number;
  broker: BrokerId;
  instrument: string;
};

export const HISTORY: HistoryEvent[] = [
  { id: "h1", time: "13:41", day: "Today", toolId: "trailing-sl", text: "Auto Trailing SL moved SL from ₹24,470 → ₹24,500 for NIFTY JUN FUT", broker: "dhan", instrument: "NIFTY JUN FUT" },
  { id: "h2", time: "12:48", day: "Today", toolId: "partial-profit", text: "Partial Profit Book hit Target 1 — exited 2 lots NIFTY 24400 PE at ₹168.20", impact: 3855, broker: "zerodha", instrument: "NIFTY 24400 PE" },
  { id: "h3", time: "12:15", day: "Today", toolId: "no-motion", text: "No-Motion Exit closed SBIN — moved 0.9 of 3 pts between 11:45 and 12:15", impact: -1890, broker: "angel", instrument: "SBIN" },
  { id: "h4", time: "11:57", day: "Today", toolId: "timed-exit", text: "Timed Exit triggered — exited 1 lot BANKNIFTY 51800 CE at 11:57", impact: 1627, broker: "zerodha", instrument: "BANKNIFTY 51800 CE" },
  { id: "h5", time: "10:18", day: "Today", toolId: "range-break", text: "Range Break Exit — AXISBANK crossed above ₹1,184 · exited 200 shares", impact: 1660, broker: "angel", instrument: "AXISBANK" },
  { id: "h6", time: "09:35", day: "Today", toolId: "timed-entry", text: "Time-Based Entry placed Ladder 1 — bought 1 lot NIFTY 24500 CE at 09:35", broker: "zerodha", instrument: "NIFTY 24500 CE" },
  { id: "h7", time: "15:10", day: "Yesterday", toolId: "timed-exit", text: "Timed Exit squared off LT · 50 shares at 15:10", impact: 1475, broker: "zerodha", instrument: "LT" },
  { id: "h8", time: "13:02", day: "Yesterday", toolId: "mtm-lock", text: "MTM Lock hit the protected floor ₹1,500 — exited WIPRO", impact: 1680, broker: "angel", instrument: "WIPRO" },
  { id: "h9", time: "10:05", day: "Yesterday", toolId: "dependency", text: "Dependency Entry — NIFTY crossed above 24,400 · bought 75 NIFTY 24450 CE", broker: "dhan", instrument: "NIFTY 24450 CE" },
];

export type AlertSeverity = "critical" | "warning" | "success" | "info";

export type AlertItem = {
  id: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  time: string;
  action: "View" | "Retry" | "Reconnect" | "Dismiss";
  unread?: boolean;
};

export const ALERTS: AlertItem[] = [
  { id: "al1", severity: "critical", title: "Partial Profit Book failed on BANKNIFTY 52000 PE", body: "Order rejected — insufficient margin. 2 automatic retries failed.", time: "13:38", action: "Retry", unread: true },
  { id: "al2", severity: "info", title: "No-Motion Exit window ends in 3 min", body: "RELIANCE has moved 2.35 of the required 5 pts since 13:00.", time: "13:57", action: "View", unread: true },
  { id: "al3", severity: "warning", title: "Angel One session expires today", body: "Re-authenticate before 3:30 PM so tomorrow's tools don't pause.", time: "13:10", action: "Reconnect", unread: true },
  { id: "al4", severity: "warning", title: "Two exit tools on FINNIFTY 23800 CE", body: "Partial Profit Book and MTM Lock both act on this position. The first to trigger wins.", time: "10:20", action: "View" },
  { id: "al5", severity: "success", title: "Partial Profit Book executed", body: "Exited 2 lots NIFTY 24400 PE at ₹168.20 · +₹3,855", time: "12:48", action: "Dismiss" },
];

/* ------------------------------------------------------------------ */
/* Formatters                                                          */
/* ------------------------------------------------------------------ */

const inrFmt = (d: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export function inr(n: number, opts: { sign?: boolean; decimals?: number } = {}) {
  const d = opts.decimals ?? (Math.abs(n) >= 1000 ? 0 : 2);
  const s = inrFmt(d).format(Math.abs(n));
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}₹${s}`;
}

export function num(n: number, d = 2) {
  return inrFmt(d).format(n);
}

export function pnlOf(p: Position) {
  return (p.ltp - p.avg) * p.qty * (p.side === "BUY" ? 1 : -1);
}

export function pctOf(p: Position) {
  return ((p.ltp - p.avg) / p.avg) * 100 * (p.side === "BUY" ? 1 : -1);
}

export function isFO(kind: InstrumentKind) {
  return kind !== "stock";
}

export function lotsOf(p: Position) {
  return Math.round(p.qty / p.lotSize);
}

export function qtyLabel(p: Position) {
  if (isFO(p.kind)) {
    const l = lotsOf(p);
    return `${l} lot${l === 1 ? "" : "s"} · ${p.qty} qty`;
  }
  return `${p.qty} shares`;
}

export function brokerName(id: BrokerId) {
  return BROKERS.find((b) => b.id === id)?.name ?? id;
}
