import { ArrowUpRight, Download, ShieldCheck } from "lucide-react";
import { Button, Card } from "../../ui";

export default function ForceUpdate() {
  return <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
    <section className="w-full max-w-md text-center">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary"><Download size={25} strokeWidth={2} /></div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">A new version is available</h1>
      <p className="mt-3 text-sm leading-6 text-muted">This update includes critical fixes. Please update to continue.</p>
      <Card className="mt-6 flex items-center justify-center gap-3 py-3" padded={false}><span className="font-mono text-sm tabular-nums text-muted">v1.4.0</span><ArrowUpRight size={15} strokeWidth={2} className="text-faint" /><span className="font-mono text-sm font-semibold tabular-nums text-ink">v1.5.0</span></Card>
      <Button className="mt-6" size="lg" icon={ShieldCheck} iconRight={ArrowUpRight} onClick={() => undefined}>Update Now</Button>
      <p className="mt-4 text-xs text-muted">Your armed tools keep running securely on our servers.</p>
    </section>
  </main>;
}
