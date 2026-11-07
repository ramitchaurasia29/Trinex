import { useState } from "react";
import AppShell from "../../AppShell";
import { Card, SectionTitle, Toggle } from "../../ui";
import { PageStack, SettingRow } from "./common";
const groups = [{ title: "Tool events", rows: [["Tool triggered successfully", true], ["Tool approaching trigger (5 min before)", true], ["SL moved by trailer", true], ["Tool conflict warning", true], ["Tool execution failed", true, "Critical — recommended"]] as [string, boolean, string?][] }, { title: "Broker", rows: [["Broker sync error", true]] as [string, boolean, string?][] }, { title: "Summary", rows: [["Daily P&L summary", false]] as [string, boolean, string?][] }, { title: "Delivery", rows: [["Sound", true], ["Vibration", true]] as [string, boolean, string?][] }];
export default function Notifications() {
  const [values, setValues] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.flatMap((g) => g.rows.map(([label, enabled]) => [label, enabled]))));
  return <AppShell title="Notification preferences" back="/more" width="narrow"><PageStack>{groups.map((g) => <Card key={g.title}><SectionTitle>{g.title}</SectionTitle><div className="divide-y divide-line">{g.rows.map(([label, , hint]) => <SettingRow key={label} label={label} hint={hint}><div className="flex justify-end"><Toggle label={label} checked={values[label]} onChange={(v) => setValues((x) => ({ ...x, [label]: v }))} /></div></SettingRow>)}</div></Card>)}</PageStack></AppShell>;
}
