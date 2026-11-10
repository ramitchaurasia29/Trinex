import { useState } from "react";
import { Camera } from "lucide-react";
import AppShell from "../../AppShell";
import { ApiError } from "../../api";
import { useAuth } from "../../auth";
import { useStore } from "../../store";
import { Badge, Button, Card, TextInput } from "../../ui";
import { PageStack, SettingRow } from "./common";
export default function Profile() {
  const { user, toast } = useStore(); const { updateProfile } = useAuth(); const [name, setName] = useState(user.name); const [email, setEmail] = useState(user.email); const [saving, setSaving] = useState(false);
  const dirty = name !== user.name || email !== user.email;
  const save = async () => { const cleanName = name.trim(); if (!cleanName) { toast("Name cannot be empty", "error"); return; } setSaving(true); try { const updated = await updateProfile({ display_name: cleanName, email: email.trim() || null }); setName(updated.display_name); setEmail(updated.email ?? ""); toast("Profile updated"); } catch (error) { toast(error instanceof ApiError ? error.message : "Profile update failed", "error"); } finally { setSaving(false); } };
  const initials = user.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return <AppShell title="Profile" back="/more" width="narrow"><PageStack><Card><div className="flex items-center gap-4 border-b border-line pb-4"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-primary">{initials}</span><div><p className="font-semibold tracking-tight">Profile photo</p><Button className="mt-2" variant="secondary" size="sm" icon={Camera} onClick={() => toast("Photo upload is coming soon", "info")}>Change photo</Button></div></div><div className="divide-y divide-line"><SettingRow label="Name"><TextInput value={name} onChange={setName} /></SettingRow><SettingRow label="Phone" hint="Your verified sign-in number"><div className="flex items-center gap-2"><TextInput value={user.phone} onChange={() => {}} disabled /><Badge tone="profit">Verified</Badge></div></SettingRow><SettingRow label="Email" hint="Optional"><TextInput value={email} onChange={setEmail} inputMode="email" /></SettingRow></div><p className="mt-3 text-xs text-muted">Member since {user.since}</p></Card><div className="flex justify-end"><Button disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</Button></div></PageStack></AppShell>;
}
