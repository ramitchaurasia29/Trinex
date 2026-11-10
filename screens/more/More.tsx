import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, BookOpen, ChevronRight, Headphones, Info, LogOut, Palette, Shield, SlidersHorizontal } from "lucide-react";
import AppShell from "../../AppShell";
import { useAuth } from "../../auth";
import { useStore } from "../../store";
import { Badge, Button, Card, Dot, Modal, SectionTitle } from "../../ui";

const groups = [
  { title: "Settings", rows: [{ label: "Notification Preferences", to: "/more/notifications", icon: Bell }, { label: "Tool Defaults", to: "/more/defaults", icon: SlidersHorizontal }, { label: "Appearance", to: "/more/appearance", icon: Palette }] },
  { title: "Support", rows: [{ label: "Help & Tutorials", to: "/more/help", icon: BookOpen }, { label: "Contact Support", to: "/more/support", icon: Headphones }, { label: "About", to: "/more/about", icon: Info }] },
  { title: "Account", rows: [{ label: "Account Management", to: "/more/account", icon: Shield }] },
];
export default function More() {
  const { user, brokers, armed } = useStore(); const { logout: endSession } = useAuth(); const nav = useNavigate(); const [logout, setLogout] = useState(false); const [loggingOut, setLoggingOut] = useState(false);
  const confirmLogout = async () => { setLoggingOut(true); try { await endSession(); nav("/login", { replace: true }); } finally { setLoggingOut(false); } };
  const connected = brokers.filter((b) => b.status !== "disconnected");
  const initials = user.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return <AppShell title="More" width="narrow"><div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1.2fr_0.8fr]">
    <div className="flex flex-col gap-5">
      <Link to="/more/profile" className="block"><Card className="flex items-center gap-4 p-4 hover:border-line-strong"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initials}</span><span className="min-w-0 flex-1"><span className="block text-base font-semibold tracking-tight text-ink">{user.name}</span><span className="block text-sm text-muted">{user.phone}</span></span><ChevronRight size={19} strokeWidth={2} className="text-faint" /></Card></Link>
      <Card><SectionTitle action={<Link className="text-xs font-medium text-primary" to="/more/brokers">Manage <span aria-hidden>→</span></Link>}>Connected brokers</SectionTitle><div className="flex flex-wrap gap-2">{connected.map((b) => <span key={b.id} className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-2"><Dot tone={b.status === "connected" ? "profit" : b.status === "syncing" ? "warn" : b.status === "error" ? "loss" : "neutral"} /><span className="text-sm font-medium text-ink-2">{b.name}</span>{b.status !== "connected" && <Badge tone={b.status === "expired" ? "neutral" : b.status === "error" ? "loss" : "warn"}>{b.status}</Badge>}</span>)}</div></Card>
      {groups.map((group) => <section key={group.title}><SectionTitle>{group.title}</SectionTitle><Card padded={false}>{group.rows.map(({ label, to, icon: Icon }, i) => <Link key={to} to={to} className={["flex min-h-12 items-center gap-3 px-4 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2", i ? "border-t border-line" : ""].join(" ")}><Icon size={18} strokeWidth={2} className="text-muted" /><span className="flex-1">{label}</span><ChevronRight size={17} strokeWidth={2} className="text-faint" /></Link>)}</Card></section>)}
      <button onClick={() => setLogout(true)} className="flex min-h-12 items-center gap-3 rounded-lg border border-loss-line bg-surface px-4 text-sm font-medium text-loss hover:bg-loss-soft"><LogOut size={18} strokeWidth={2} />Log out</button>
      <p className="text-center text-xs text-faint">v1.5.0 · Made in India</p>
    </div>
    <aside className="hidden lg:block"><Card><SectionTitle>At a glance</SectionTitle><div className="space-y-4"><div><p className="text-xs text-muted">Connected brokers</p><p className="mt-1 text-2xl font-semibold tracking-tight">{connected.length}</p></div><div className="h-px bg-line" /><div><p className="text-xs text-muted">Tools running</p><p className="mt-1 text-2xl font-semibold tracking-tight">{armed.length}</p></div><Link to="/more/brokers" className="inline-flex items-center gap-1 text-sm font-medium text-primary">Review connections <ChevronRight size={16} /></Link></div></Card></aside>
    <Modal open={logout} onClose={() => setLogout(false)} title="Log out of Timed Exit?" actions={<><Button variant="secondary" onClick={() => setLogout(false)} disabled={loggingOut}>Stay signed in</Button><Button variant="danger" icon={LogOut} onClick={confirmLogout} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"}</Button></>}><p>Your armed tools keep running on our servers. You’ll need an OTP to log back in.</p></Modal>
  </div></AppShell>;
}
