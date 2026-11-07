import { useNavigate } from "react-router-dom";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "../../ui";

export default function Offline() {
  const navigate = useNavigate();
  return <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
    <section className="w-full max-w-md text-center">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-ink-2"><WifiOff size={26} strokeWidth={2} /></div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">No internet connection</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Check your Wi-Fi or mobile data and try again</p>
      <Button className="mt-7" size="lg" icon={RefreshCw} onClick={() => navigate("/positions")}>Retry</Button>
      <div className="mx-auto mt-9 max-w-sm rounded-lg border border-warn-line bg-warn-soft p-4 text-left">
        <p className="flex items-center gap-2 text-sm font-semibold text-warn"><AlertTriangle size={16} strokeWidth={2} /> Data may be stale</p>
        <p className="mt-2 text-sm leading-5 text-ink-2">Your armed tools keep running on our servers.</p>
      </div>
    </section>
  </main>;
}
