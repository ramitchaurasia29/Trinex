import { useState } from "react";
import { AlertTriangle, Plus, RefreshCw, RotateCw, Unplug } from "lucide-react";
import AppShell from "../../AppShell";
import { BROKERS, type Broker, type BrokerId } from "../../data";
import { useStore } from "../../store";
import { useTradingData } from "../../trading";
import { Badge, Banner, BrokerMark, Button, Card, Modal, SectionTitle } from "../../ui";
import { PageStack } from "./common";

const statusMeta: Record<Broker["status"], { label: string; tone: "profit" | "warn" | "loss" | "neutral" }> = {
  connected: { label: "Connected", tone: "profit" }, syncing: { label: "Syncing", tone: "warn" }, error: { label: "Error", tone: "loss" }, expired: { label: "Expired", tone: "neutral" }, disconnected: { label: "Disconnected", tone: "neutral" },
};

export default function Brokers() {
  const { brokers, armed, positions, toast } = useStore();
  const trading = useTradingData();
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const selected = brokers.find((b) => b.id === disconnectId);
  const affected = disconnectId ? armed.filter((a) => positions.find((p) => p.id === a.positionId)?.brokerAccountId === disconnectId) : [];
  const run = async (work: () => Promise<unknown>, success: string) => { try { await work(); toast(success); } catch { toast(trading.error ?? "Broker operation failed", "error"); } };
  const connect = async (id: BrokerId) => { setConnecting(id); try { await trading.connect(id); toast(id === "mock" ? "Mock Broker connected in SIMULATED mode" : "Broker connected"); } catch { toast(id === "mock" ? "Mock Broker connection failed" : "This real broker is not available yet", "error"); } finally { setConnecting(null); } };
  const confirmDisconnect = async () => { if (!disconnectId) return; await run(() => trading.disconnect(disconnectId), `${selected?.name ?? "Broker"} disconnected; positions retained as stale`); setDisconnectId(null); };

  return <AppShell title="Connected brokers" back="/more" width="narrow"><PageStack>
    {trading.error && <Banner tone="loss" icon={AlertTriangle}>{trading.error}</Banner>}
    <Card><SectionTitle>Connected accounts</SectionTitle><div className="divide-y divide-line">
      {brokers.length === 0 && <p className="py-5 text-sm text-muted">No broker accounts connected yet.</p>}
      {brokers.map((b) => { const meta = statusMeta[b.status]; return <div key={b.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><BrokerMark id={b.provider ?? b.id} size="md" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{b.name}</span><Badge tone={meta.tone} dot>{meta.label}</Badge><Badge tone="primary">SIMULATED</Badge></div><p className="mt-1 text-xs text-muted">Last successful sync {b.lastSync ?? "—"} · {b.positions} positions</p></div><div className="flex items-center gap-1">{b.status === "disconnected" ? <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => void run(() => trading.reconnect(b.id), `${b.name} reconnected; paused tools remain paused`)}>Reconnect</Button> : <><Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void run(() => trading.syncAccount(b.id), `${b.name} synchronized`)}>Refresh</Button><Button size="sm" variant="ghost" icon={Unplug} onClick={() => setDisconnectId(b.id)}>Disconnect</Button></>}</div></div>; })}
    </div></Card>
    <Card><SectionTitle>Add a broker</SectionTitle><div className="grid gap-2 sm:grid-cols-2">{BROKERS.map((b) => <div key={b.id} className="flex items-center gap-3 rounded-md border border-line p-3"><BrokerMark id={b.id} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>{b.id === "mock" && <Badge tone="primary">PAPER</Badge>}<Button size="sm" variant="secondary" icon={Plus} disabled={connecting === b.id} onClick={() => void connect(b.id as BrokerId)}>{connecting === b.id ? "Connecting…" : "Connect"}</Button></div>)}</div><p className="mt-4 text-xs text-muted">Only Mock Broker is available in Phase 3. Zerodha and other real authorizations are not simulated.</p></Card>
    <Modal open={!!disconnectId} onClose={() => setDisconnectId(null)} title={`Disconnect ${selected?.name ?? "broker"}?`} tone="danger" icon={AlertTriangle} actions={<><Button variant="secondary" onClick={() => setDisconnectId(null)}>Keep Connected</Button><Button variant="danger" onClick={() => void confirmDisconnect()}>Disconnect</Button></>}><p>This keeps all positions and snapshots, marks data stale, and pauses {affected.length} linked active tool{affected.length === 1 ? "" : "s"}. Tools will not resume automatically.</p></Modal>
  </PageStack></AppShell>;
}
