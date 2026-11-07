import { useEffect, useState } from "react";
import { ArrowRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "../../ui";
import { useScreenInit } from "../../useScreenInit";
import { OnboardingFrame, PositionIllustration } from "./OnboardingFrame";

const SYNC_ROWS = [
  { name: "Zerodha", count: 5, delay: 700 },
  { name: "Angel One", count: 2, delay: 1500 },
  { name: "Dhan", count: 1, delay: 2300 },
];

export default function Sync() {
  const initial = useScreenInit();
  const [complete, setComplete] = useState(Boolean(initial.done));
  const [finished, setFinished] = useState<boolean[]>(initial.done ? [true, true, true] : [false, false, false]);
  const navigate = useNavigate();
  useEffect(() => {
    if (initial.done) return;
    const timers = SYNC_ROWS.map((row, index) => window.setTimeout(() => {
      setFinished((old) => old.map((value, i) => i === index ? true : value));
      if (index === SYNC_ROWS.length - 1) setComplete(true);
    }, row.delay));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return <OnboardingFrame visual={<PositionIllustration />}>
    <div className="mx-auto w-full max-w-md">
      <p className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">Step 2 of 2</p>
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-profit-soft text-profit"><ShieldCheck size={22} strokeWidth={2} /></div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{complete ? "You're all set" : "Syncing your positions"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{complete ? "Your positions are ready in one clear view." : "We're securely bringing your open positions together."}</p>
      <Card className="mt-7" padded={false}><div className="divide-y divide-line">{SYNC_ROWS.map((row, index) => <div key={row.name} className="flex items-center gap-3 px-4 py-4"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${finished[index] ? "bg-profit-soft text-profit" : "bg-surface-2 text-muted"}`}>{finished[index] ? <Check size={16} strokeWidth={2} /> : <LoaderCircle size={16} strokeWidth={2} />}</span><span className="flex-1 text-sm font-medium text-ink">{finished[index] ? row.name : `Syncing positions from ${row.name}…`}</span>{finished[index] && <span className="font-mono text-sm tabular-nums text-muted">{row.count} positions</span>}</div>)}</div></Card>
      {complete && <p className="mt-5 text-center text-sm font-medium text-ink-2">8 open positions synced across 3 brokers</p>}
      <Button className="mt-7" size="lg" full iconRight={ArrowRight} disabled={!complete} onClick={() => navigate("/positions")}>Go to Positions</Button>
      {complete && <button onClick={() => navigate("/tools")} className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline">Arm your first tool <span className="font-normal text-muted">· under 2 minutes</span></button>}
    </div>
  </OnboardingFrame>;
}
