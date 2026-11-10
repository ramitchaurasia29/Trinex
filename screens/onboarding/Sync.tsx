import { useEffect, useState } from "react";
import { ArrowRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store";
import { useTradingData } from "../../trading";
import { Button, Card } from "../../ui";
import { OnboardingFrame, PositionIllustration } from "./OnboardingFrame";

export default function Sync() {
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const { brokers, positions } = useStore();
  const trading = useTradingData();
  const connected = brokers.filter((b) => b.status === "connected" || b.status === "syncing");
  useEffect(() => {
    let current = true;
    void trading.syncAll().then(() => { if (current) setComplete(true); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, []);

  return <OnboardingFrame visual={<PositionIllustration />}>
    <div className="mx-auto w-full max-w-md">
      <p className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">Step 2 of 2</p>
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-profit-soft text-profit"><ShieldCheck size={22} strokeWidth={2} /></div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{complete ? "You're all set" : failed ? "Sync needs attention" : "Syncing your positions"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{complete ? "Your simulated paper positions are ready in one clear view." : failed ? (trading.error ?? "The sync could not be completed.") : "We're securely bringing your paper positions together."}</p>
      <Card className="mt-7" padded={false}><div className="divide-y divide-line">{connected.map((row) => <div key={row.id} className="flex items-center gap-3 px-4 py-4"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${complete ? "bg-profit-soft text-profit" : "bg-surface-2 text-muted"}`}>{complete ? <Check size={16} strokeWidth={2} /> : <LoaderCircle className="animate-spin" size={16} strokeWidth={2} />}</span><span className="flex-1 text-sm font-medium text-ink">{complete ? row.name : `Syncing positions from ${row.name}…`}</span>{complete && <span className="font-mono text-sm tabular-nums text-muted">{row.positions} positions</span>}</div>)}</div></Card>
      {complete && <p className="mt-5 text-center text-sm font-medium text-ink-2">{positions.length} open positions synced across {connected.length} simulated account{connected.length === 1 ? "" : "s"}</p>}
      {failed && <Button className="mt-5" full variant="secondary" onClick={() => { setFailed(false); void trading.syncAll().then(() => setComplete(true)).catch(() => setFailed(true)); }}>Retry synchronization</Button>}
      <Button className="mt-7" size="lg" full iconRight={ArrowRight} disabled={!complete} onClick={() => navigate("/positions")}>Go to Positions</Button>
      {complete && <button onClick={() => navigate("/tools")} className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline">Arm your first tool <span className="font-normal text-muted">· under 2 minutes</span></button>}
    </div>
  </OnboardingFrame>;
}
