import { useState } from "react";
import { ArrowRight, Check, Layers3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BROKERS, TOOLS } from "../../data";
import { useScreenInit } from "../../useScreenInit";
import { Badge, BrokerMark, Button, Card } from "../../ui";
import { OnboardingFrame, PositionIllustration } from "./OnboardingFrame";

const slides = [
  { title: "All your brokers. One powerful view.", body: "Connect Zerodha, Angel One, Dhan, and more" },
  { title: "8 tools brokers don't give you.", body: "Auto-trail SL, time-based exits, profit locking, and more" },
  { title: "Set it. Forget it. Trade smart.", body: "Your tools monitor and execute — so you don't have to" },
];

function SlideVisual({ slide }: { slide: number }) {
  if (slide === 0) return <div className="w-full max-w-sm">
    <div className="mb-4 flex justify-center -space-x-2">{BROKERS.slice(0, 4).map((b) => <span key={b.id} className="rounded-full border-4 border-surface-2"><BrokerMark id={b.id} size="lg" /></span>)}<span className="ml-2 flex h-11 w-11 items-center justify-center rounded-full border-4 border-surface-2 bg-primary text-white"><Layers3 size={18} strokeWidth={2} /></span></div>
    <Card><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Your positions</p><p className="text-xs text-muted">Across 3 brokers</p></div><Badge tone="profit" dot>Live</Badge></div>{[{ symbol: "NIFTY 24500 CE", broker: "zerodha" as const, pnl: "+₹2,418" }, { symbol: "RELIANCE", broker: "angel" as const, pnl: "+₹470" }, { symbol: "NIFTY JUN FUT", broker: "dhan" as const, pnl: "−₹820" }].map((p) => <div key={p.symbol} className="mt-4 flex items-center gap-2 border-t border-line pt-3"><BrokerMark id={p.broker} /><span className="flex-1 text-xs font-medium text-ink-2">{p.symbol}</span><span className={`font-mono text-xs ${p.pnl.startsWith("−") ? "text-loss" : "text-profit"}`}>{p.pnl}</span></div>)}</Card>
  </div>;
  if (slide === 1) return <div className="grid w-full max-w-sm grid-cols-2 gap-3">{TOOLS.map(({ id, name, icon: Icon }) => <div key={id} className="flex min-h-20 items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-card"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon size={18} strokeWidth={2} /></span><span className="text-xs font-semibold leading-snug text-ink-2">{name}</span></div>)}</div>;
  return <PositionIllustration />;
}

export default function Welcome() {
  const initial = useScreenInit();
  const [slide, setSlide] = useState(Math.max(0, Math.min(2, Number(initial.slide ?? 0))));
  const navigate = useNavigate();
  const last = slide === slides.length - 1;
  return <OnboardingFrame visual={<SlideVisual slide={slide} />}>
    <div className="mb-12 flex justify-end lg:hidden"><button onClick={() => navigate("/login")} className="text-sm font-medium text-muted hover:text-ink">Skip</button></div>
    <div className="mb-7 hidden justify-end lg:flex"><button onClick={() => navigate("/login")} className="text-sm font-medium text-muted hover:text-ink">Skip</button></div>
    <div className="mb-6 flex gap-2" aria-label={`Slide ${slide + 1} of 3`}>{slides.map((item, i) => <button key={item.title} onClick={() => setSlide(i)} aria-label={`Go to slide ${i + 1}`} className={`h-1.5 rounded-full ${i === slide ? "w-8 bg-primary" : "w-2 bg-line-strong"}`} />)}</div>
    <h1 className="max-w-lg text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{slides[slide].title}</h1>
    <p className="mt-4 max-w-md text-base leading-7 text-muted">{slides[slide].body}</p>
    <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">{last ? <Button size="lg" iconRight={ArrowRight} onClick={() => navigate("/login")}>Get Started</Button> : <Button size="lg" iconRight={ArrowRight} onClick={() => setSlide((v) => Math.min(v + 1, 2))}>Next</Button>}</div>
    {last && <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted"><Check size={14} strokeWidth={2} className="text-profit" /> Your tools keep running, even when you step away.</p>}
  </OnboardingFrame>;
}
