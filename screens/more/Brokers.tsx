import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, RefreshCw, Unplug } from "lucide-react";
import AppShell from "../../AppShell";
import { BROKERS, type Broker, type BrokerId } from "../../data";
import { useStore } from "../../store";
import { Badge, Banner, BrokerMark, Button, Card, Modal, SectionTitle } from "../../ui";
import { useScreenInit } from "../../useScreenInit";
import { PageStack } from "./common";
const statusMeta: Record<Broker["status"], { label: string; tone: "profit" | "warn" | "loss" | "neutral" }> = { connected: { label: "Connected", tone: "profit" }, syncing: { label: "Syncing", tone: "warn" }, error: { label: "Error", tone: "loss" }, expired: { label: "Expired", tone: "neutral" }, disconnected: { label: "Disconnected", tone: "neutral" } };
export default function Brokers() {
  const { brokers, armed, positions, setBrokerStatus, connectBroker, disconnectBroker, toast } = useStore();
  const init = useScreenInit(); const nav = useNavigate();
  const [disconnect, setDisconnect] = useState<BrokerId | null>(null); const [connecting, setConnecting] = useState<BrokerId | null>(null);
  const seeded = useRef(false);
  useEffect(() => { if (init.expired === true && !seeded.current) { seeded.current = true; setBrokerStatus("angel", "expired"); } }, [init.expired, setBrokerStatus]);
  const connected = brokers.filter((b) => b.status !== "disconnected"); const available = BROKERS.filter((b) => !brokers.find((x) => x.id === b.id && x.status !== "disconnected"));
  const selected = brokers.find((b) => b.id === disconnect); const affected = disconnect ? armed.filter((a) => { const p = positions.find((x) => x.id === a.positionId); return p?.broker === disconnect; }) : [];
  const sync = (id: BrokerId) => { const b = brokers.find((x) => x.id === id); setBrokerStatus(id, "syncing"); setTimeout(() => { setBrokerStatus(id, "connected"); toast(`${b?.name ?? "Broker"} synced · ${b?.positions ?? 0} positions`); }, 500); };
  const confirmDisconnect = () => { if (!disconnect) return; disconnectBroker(disconnect); toast(`${selected?.name ?? "Broker"} disconnected`); setDisconnect(null); };
  const connect = (id: BrokerId) => { setConnecting(id); setTimeout(() => { connectBroker(id); setConnecting(null); toast(`${BROKERS.find((b) => b.id === id)?.name} connected · 0 positions synced`); }, 800); };
  return <AppShell title="Connected brokers" back="/more" width="narrow"><PageStack>
    {brokers.some((b) => b.id === "angel" && b.status === "expired") && <Banner tone="loss" icon={AlertTriangle} action={<Button size="sm" variant="secondary" onClick={() => { setBrokerStatus("angel", "connected"); toast("Angel One reconnected · tools resumed"); }}>Reconnect</Button>}>Angel One connection expired. Re-authenticate to resume tool execution.</Banner>}
    <Card><SectionTitle>Connected accounts</SectionTitle><div className="divide-y divide-line">{connected.map((b) => { const meta = statusMeta[b.status]; return <div key={b.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><BrokerMark id={b.id} size="md" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{b.name}</span><Badge tone={meta.tone} dot>{meta.label}</Badge></div><p className="mt-1 text-xs text-muted">Last sync {b.lastSync ?? "—"} · {b.positions} positions</p></div><div className="flex items-center gap-1"><Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => sync(b.id)}>Refresh</Button><Button size="sm" variant="ghost" icon={Unplug} onClick={() => setDisconnect(b.id)}>Disconnect</Button></div></div>; })}</div></Card>
    <Card><SectionTitle>Add a broker</SectionTitle><div className="grid gap-2 sm:grid-cols-2">{available.map((b) => <div key={b.id} className="flex items-center gap-3 rounded-md border border-line p-3"><BrokerMark id={b.id} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span><Button size="sm" variant="secondary" icon={Plus} onClick={() => connect(b.id)}>Connect</Button></div>)}</div><p className="mt-4 text-xs text-muted">Zerodha sessions expire daily at 6 AM — we’ll remind you to reconnect.</p></Card>
    <Modal open={!!disconnect} onClose={() => setDisconnect(null)} title={`Disconnect ${selected?.name ?? "broker"}?`} tone="danger" icon={AlertTriangle} actions={<><Button variant="secondary" onClick={() => setDisconnect(null)}>Keep Connected</Button><Button variant="danger" onClick={confirmDisconnect}>Disconnect</Button></>}><p>This will cancel {affected.length} active tool{affected.length === 1 ? "" : "s"} on {selected?.name ?? "broker"} positions:</p><ul className="mt-3 list-disc space-y-1 pl-5">{affected.length ? affected.map((a) => <li key={a.id}>{a.summary} · {a.target}</li>) : <li>No active tools are attached to this broker.</li>}</ul></Modal>
    <Modal open={!!connecting} onClose={() => setConnecting(null)} title={`Connecting to ${BROKERS.find((b) => b.id === connecting)?.name ?? "broker"}…`} actions={<Button variant="secondary" onClick={() => setConnecting(null)}>Cancel</Button>}><p>Secure broker authorization is being prepared. Your password is never stored by Timed Exit.</p></Modal>
  </PageStack></AppShell>;
}
