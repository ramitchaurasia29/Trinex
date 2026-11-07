import { Clock3 } from "lucide-react";
import type { ReactNode } from "react";

export function Brand() {
  return <div className="inline-flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-white"><Clock3 size={18} strokeWidth={2} /></span><span className="text-base font-semibold tracking-tight text-ink">Timed Exit</span></div>;
}

export function OnboardingFrame({ children, visual, className = "" }: { children: ReactNode; visual: ReactNode; className?: string }) {
  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
        <section className="flex flex-col bg-surface-2 px-6 py-5 sm:px-10 lg:min-h-screen lg:px-12 lg:py-8">
          <Brand />
          <div className="flex flex-1 items-center justify-center py-8 lg:py-12">{visual}</div>
          <p className="hidden text-xs text-muted lg:block">A calmer way to manage every trade.</p>
        </section>
        <section className={`flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-16 lg:py-12 ${className}`}>
          {children}
        </section>
      </div>
    </main>
  );
}

export function PositionIllustration() {
  return <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-card">
    <div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted">OPEN POSITION</p><p className="mt-1 text-base font-semibold tracking-tight">NIFTY 24500 CE</p><p className="text-xs text-muted">Zerodha · 2 lots</p></div><span className="rounded-full bg-profit-soft px-2 py-1 text-xs font-medium text-profit">+₹2,418</span></div>
    <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full border border-primary-line bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">Timed Exit</span><span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">Auto-trail SL</span></div>
    <div className="mt-5 flex items-center justify-between rounded-md bg-surface-2 px-3 py-3"><span className="text-sm text-ink-2">Fires in</span><span className="font-mono text-sm font-semibold tabular-nums text-ink">02:00</span></div>
  </div>;
}
