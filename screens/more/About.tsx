import { FileText, Globe2, Scale } from "lucide-react";
import AppShell from "../../AppShell";
import { Card } from "../../ui";
import { PageStack } from "./common";
const links = [{ title: "Terms of Service", icon: FileText }, { title: "Privacy Policy", icon: Globe2 }, { title: "Open-source licenses", icon: Scale }];
export default function About() {
  return <AppShell title="About Timed Exit" back="/more" width="narrow"><PageStack><Card><div className="flex flex-col items-center py-5 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-xl bg-ink text-white"><span className="text-xl font-semibold">T</span></span><h2 className="mt-3 text-xl font-semibold tracking-tight">Timed Exit</h2><p className="mt-1 text-sm text-muted">Version 1.5.0 (build 214)</p></div></Card><Card padded={false}><div className="divide-y divide-line">{links.map(({ title, icon: Icon }) => <button key={title} onClick={() => {}} className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-ink-2 hover:bg-surface-2"><Icon size={18} strokeWidth={2} className="text-muted" /><span className="flex-1">{title}</span><span className="text-xs text-muted">View</span></button>)}</div></Card><Card><p className="text-center text-sm font-medium text-ink-2">Made in India 🇮🇳</p><p className="mt-4 border-t border-line pt-4 text-center text-sm leading-6 text-muted">Timed Exit is a tools layer on top of your broker. We don’t give investment advice.</p></Card></PageStack></AppShell>;
}
