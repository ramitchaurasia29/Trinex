import { useState } from "react";
import { ArrowRight, Check, LockKeyhole, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BROKERS, type BrokerId } from "../../data";
import { useStore } from "../../store";
import { useScreenInit } from "../../useScreenInit";
import { Badge, BrokerMark, Button, Card, Modal } from "../../ui";
import { OnboardingFrame, PositionIllustration } from "./OnboardingFrame";

type ConnectFlow = { id: BrokerId; status: "connecting" | "success" | "error" | "cancelled" } | null;

export default function ConnectBrokers() {
  const initial = useScreenInit();
  const seeded = Array.isArray(initial.connected) ? initial.connected.filter((v): v is BrokerId => typeof v === "string" && BROKERS.some((b) => b.id === v)) : [];
  const [connected, setConnected] = useState<BrokerId[]>(seeded);
  const [flow, setFlow] = useState<ConnectFlow>(null);
  const navigate = useNavigate();
  const { connectBroker } = useStore();
  const broker = flow ? BROKERS.find((b) => b.id === flow.id) : undefined;

  const startConnect = (id: BrokerId) => {
    setFlow({ id, status: "connecting" });
    window.setTimeout(() => {
      if (id === "upstox") setFlow({ id, status: "error" });
      else if (id === "groww") setFlow({ id, status: "cancelled" });
      else {
        setConnected((old) => old.includes(id) ? old : [...old, id]);
        connectBroker(id);
        setFlow({ id, status: "success" });
      }
    }, 1200);
  };

  const title = flow?.status === "connecting" ? `Connecting to ${broker?.name}…` : flow?.status === "success" ? `${broker?.name} connected` : flow?.status === "error" ? "Connection failed" : "Connection cancelled";
  return <OnboardingFrame visual={<PositionIllustration />} className="justify-start lg:py-10">
    <div className="mx-auto w-full max-w-2xl">
      <p className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">Step 1 of 2</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Connect your brokers</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Connect at least one broker to sync your positions.</p>
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{BROKERS.map((b) => {
        const isConnected = connected.includes(b.id);
        return <Card key={b.id} className="flex min-h-32 flex-col justify-between p-3" padded={false}>
          <div className="flex items-center gap-2"><BrokerMark id={b.id} size="md" /><p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-ink">{b.name}</p></div>
          {isConnected ? <Badge tone="profit" className="mt-3 w-fit"><Check size={12} strokeWidth={2} /> Connected</Badge> : <Button className="mt-3 w-full" size="sm" variant="secondary" onClick={() => startConnect(b.id)}>Connect</Button>}
        </Card>;
      })}</div>
      <div className="mt-5 flex items-start gap-2 rounded-md bg-info-soft px-3 py-2.5 text-xs leading-5 text-info"><ShieldCheck size={15} strokeWidth={2} className="mt-0.5 shrink-0" /><span>Read-only sync via official broker APIs. We never see your password.</span></div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><Button variant="link" onClick={() => navigate("/positions?empty=1")}>I'll do this later</Button><Button size="lg" iconRight={ArrowRight} disabled={connected.length < 1} onClick={() => navigate("/onboarding/sync")}>Continue</Button></div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted"><LockKeyhole size={13} strokeWidth={2} />Your broker login stays with your broker.</p>
    </div>
    <Modal open={Boolean(flow)} onClose={() => setFlow(null)} title={title ?? "Connect broker"} icon={flow?.status === "success" ? Check : flow?.status === "error" ? X : ShieldCheck} tone={flow?.status === "error" ? "danger" : "neutral"} actions={flow?.status === "connecting" ? <Button variant="secondary" onClick={() => setFlow(null)}>Cancel</Button> : flow?.status === "success" ? <Button onClick={() => setFlow(null)}>Done</Button> : <><Button variant="secondary" onClick={() => setFlow(null)}>Close</Button><Button icon={RefreshCw} onClick={() => flow && startConnect(flow.id)}>{flow?.status === "error" ? "Retry" : "Try Again"}</Button></>}>
      {flow?.status === "connecting" && <p>Follow the secure sign-in steps from {broker?.name}. This demo will finish the connection shortly.</p>}
      {flow?.status === "success" && <p className="font-medium text-profit">✓ {broker?.name} connected</p>}
      {flow?.status === "error" && <p>Couldn't reach Upstox. Check your connection and try again.</p>}
      {flow?.status === "cancelled" && <p>Connection cancelled. You can try again anytime.</p>}
    </Modal>
  </OnboardingFrame>;
}
