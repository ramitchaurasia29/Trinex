import { AlertTriangle, Clock3, Wrench } from "lucide-react";

export default function Maintenance() {
  return <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
    <section className="w-full max-w-md text-center">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary"><Wrench size={25} strokeWidth={2} /></div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">We're upgrading things. Back in a few minutes.</h1>
      <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink-2"><Clock3 size={15} strokeWidth={2} /> Expected back by 18:30 IST</p>
      <p className="mt-5 text-sm text-muted">Checking automatically…</p>
      <div className="mx-auto mt-9 max-w-sm rounded-lg border border-warn-line bg-warn-soft p-4 text-left">
        <p className="flex items-center gap-2 text-sm font-semibold text-warn"><AlertTriangle size={16} strokeWidth={2} /> Your trades stay protected</p>
        <p className="mt-2 text-sm leading-5 text-ink-2">Your armed tools keep running while we're upgrading.</p>
      </div>
    </section>
  </main>;
}
