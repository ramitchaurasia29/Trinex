import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Download, Trash2 } from "lucide-react";
import AppShell from "../../AppShell";
import { useStore } from "../../store";
import { Badge, Button, Card, Modal, Segmented, TextInput } from "../../ui";
import { useScreenInit } from "../../useScreenInit";
import { PageStack } from "./common";
export default function Account() {
  const { brokers, armed, toast } = useStore(); const nav = useNavigate(); const init = useScreenInit();
  const [format, setFormat] = useState("CSV"); const [step, setStep] = useState<number | null>(null); const [confirmation, setConfirmation] = useState("");
  useEffect(() => { const fromLink = Number(init.deleteStep); if (fromLink >= 1 && fromLink <= 4) setStep(fromLink); }, [init.deleteStep]);
  useEffect(() => { if (step !== 3) return; const timer = window.setTimeout(() => setStep(4), 1200); return () => window.clearTimeout(timer); }, [step]);
  const brokerCount = brokers.filter((b) => b.status !== "disconnected").length;
  return <AppShell title="Account management" back="/more" width="narrow"><PageStack><Card><div className="flex items-start gap-3"><Download size={19} strokeWidth={2} className="mt-0.5 text-primary" /><div className="flex-1"><h2 className="text-base font-semibold tracking-tight">Export my data</h2><p className="mt-1 text-sm text-muted">Download a copy of your Timed Exit activity.</p></div></div><div className="mt-4"><Segmented options={[{ value: "CSV", label: "CSV" }, { value: "JSON", label: "JSON" }]} value={format} onChange={setFormat} size="sm" /></div><ul className="mt-4 space-y-2 text-sm text-ink-2">{["Activity history", "Tool configurations", "Position history"].map((item) => <li key={item} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{item}</li>)}</ul><Button className="mt-4" icon={Download} onClick={() => toast(`Export ready · timedexit-data.${format.toLowerCase()}`)}>Export data</Button></Card>
    <Card className="border-loss-line"><div className="flex items-start gap-3"><AlertTriangle size={19} strokeWidth={2} className="mt-0.5 text-loss" /><div className="flex-1"><h2 className="text-base font-semibold tracking-tight text-loss">Danger zone</h2><p className="mt-1 text-sm text-muted">Permanently remove your account and its data.</p></div><Badge tone="loss">Irreversible</Badge></div><Button className="mt-4" variant="danger-soft" icon={Trash2} onClick={() => { setConfirmation(""); setStep(1); }}>Delete account</Button></Card>
  </PageStack>
  <Modal open={step !== null} onClose={() => step === 3 ? undefined : setStep(null)} title={step === 4 ? "Account deleted" : step === 3 ? "Deleting account…" : step === 2 ? "Confirm account deletion" : "Delete your account?"} tone="danger" icon={step === 4 ? undefined : AlertTriangle} actions={step === 1 ? <><Button variant="secondary" onClick={() => setStep(null)}>Keep account</Button><Button variant="danger" onClick={() => { setConfirmation(""); setStep(2); }}>Continue</Button></> : step === 2 ? <><Button variant="secondary" onClick={() => setStep(1)}>Back</Button><Button variant="danger" disabled={confirmation !== "DELETE"} onClick={() => setStep(3)}>Delete account</Button></> : step === 4 ? <Button onClick={() => nav("/welcome")}>Continue</Button> : null}>
    {step === 1 && <><p>This will permanently delete your account, disconnect all brokers, and cancel all active tools.</p><ul className="mt-3 list-disc space-y-1 pl-5"><li>{brokerCount} connected broker{brokerCount === 1 ? "" : "s"} will be disconnected</li><li>{armed.length} active tool{armed.length === 1 ? "" : "s"} will be cancelled</li><li>Position and activity history will be deleted</li></ul></>}
    {step === 2 && <><p>Type <strong>DELETE</strong> to confirm. This action cannot be undone.</p><div className="mt-3"><TextInput value={confirmation} onChange={setConfirmation} placeholder="Type DELETE" /></div></>}
    {step === 3 && <p>Your account and connected data are being removed. Please keep this window open.</p>}
    {step === 4 && <p>Your account has been deleted. You will be logged out.</p>}
  </Modal>
  </AppShell>;
}
