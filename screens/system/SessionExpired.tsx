import { useNavigate } from "react-router-dom";
import { Clock3, LockKeyhole } from "lucide-react";
import { Button, Card, Modal } from "../../ui";

export default function SessionExpired() {
  const navigate = useNavigate();
  return <main className="relative min-h-screen overflow-hidden bg-canvas" aria-label="Session expired">
    <div aria-hidden="true" className="mx-auto max-w-6xl px-6 py-10 opacity-50">
      <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-white"><Clock3 size={18} strokeWidth={2} /></span><span className="text-base font-semibold tracking-tight text-ink">Timed Exit</span></div>
      <div className="mt-10 flex items-end justify-between"><div><div className="h-3 w-24 rounded bg-line-strong" /><div className="mt-3 h-7 w-48 rounded bg-line" /></div><div className="h-10 w-32 rounded-md bg-surface-3" /></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{["NIFTY 24500 CE", "RELIANCE"].map((item) => <Card key={item}><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">{item}</p><p className="mt-2 text-xs text-muted">Position · 2 lots</p></div><div className="h-5 w-16 rounded bg-profit-soft" /></div><div className="mt-6 h-2 rounded-full bg-surface-3" /></Card>)}</div>
    </div>
    <Modal open onClose={() => undefined} title="Session expired for security" icon={LockKeyhole} actions={<Button full onClick={() => navigate("/login")}>Log In Again</Button>}>
      <p>You were inactive for 30 minutes outside market hours.</p>
    </Modal>
  </main>;
}
