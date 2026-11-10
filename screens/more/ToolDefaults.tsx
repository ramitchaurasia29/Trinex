import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import { useStore } from "../../store";
import { useToolData } from "../../tool-data";
import { Button, Card, Segmented, Toggle } from "../../ui";
import { PageStack, SettingRow } from "./common";

const find = (items: ReturnType<typeof useToolData>["defaults"], type: string, key: string, fallback: unknown) => items.find((item) => item.tool_type === type)?.config[key] ?? fallback;

export default function ToolDefaults() {
  const { toast } = useStore(); const tools = useToolData();
  const [time, setTime] = useState("15:10"), [exitType, setExitType] = useState("full"), [foMethod, setFoMethod] = useState("lots"), [stockMethod, setStockMethod] = useState("qty");
  const [marketUnit, setMarketUnit] = useState("pts"), [slUnit, setSlUnit] = useState("pts"), [refPrice, setRefPrice] = useState("entry"), [moveType, setMoveType] = useState("pts");
  const [progressive, setProgressive] = useState(false), [ladder, setLadder] = useState(false), [rangeTrigger, setRangeTrigger] = useState("touch"), [targetCount, setTargetCount] = useState("1"), [dependencyAction, setDependencyAction] = useState("entry");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!tools.defaults.length) return; setTime(String(find(tools.defaults,"timed-exit","time","15:10"))); setExitType(String(find(tools.defaults,"timed-exit","exitType","full"))); setFoMethod(String(find(tools.defaults,"timed-exit","foPartialType","lots"))); setStockMethod(String(find(tools.defaults,"timed-exit","stockPartialType","qty"))); setMarketUnit(String(find(tools.defaults,"trailing-sl","moveUnit","pts"))); setSlUnit(String(find(tools.defaults,"trailing-sl","slUnit","pts"))); setRefPrice(String(find(tools.defaults,"no-motion","reference","entry"))); setMoveType(String(find(tools.defaults,"no-motion","movementType","pts"))); setProgressive(Boolean(find(tools.defaults,"mtm-lock","progressive",false))); setLadder(Boolean(find(tools.defaults,"timed-entry","ladder",false))); setRangeTrigger(String(find(tools.defaults,"range-break","trigger","touch"))); setTargetCount(String(find(tools.defaults,"partial-profit","targetCount",1))); setDependencyAction(String(find(tools.defaults,"dependency","action","entry"))); }, [tools.defaults]);
  const save = async () => { setSaving(true); try { const existing = Object.fromEntries(tools.defaults.map((item) => [item.tool_type, item.version])); await tools.saveDefaults([
    { tool_type:"timed-exit", config:{time,exitType,foPartialType:foMethod,stockPartialType:stockMethod}, is_enabled:true, expected_version:existing["timed-exit"] },
    { tool_type:"trailing-sl", config:{moveUnit:marketUnit,slUnit}, is_enabled:true, expected_version:existing["trailing-sl"] },
    { tool_type:"timed-entry", config:{ladder,side:"BUY"}, is_enabled:true, expected_version:existing["timed-entry"] },
    { tool_type:"no-motion", config:{reference:refPrice,movementType:moveType,exitType:"window"}, is_enabled:true, expected_version:existing["no-motion"] },
    { tool_type:"range-break", config:{rangeLevel:"high",direction:"above",trigger:rangeTrigger,exitType,foPartialType:foMethod,stockPartialType:stockMethod}, is_enabled:true, expected_version:existing["range-break"] },
    { tool_type:"partial-profit", config:{targetCount:Number(targetCount)}, is_enabled:true, expected_version:existing["partial-profit"] },
    { tool_type:"mtm-lock", config:{progressive}, is_enabled:true, expected_version:existing["mtm-lock"] },
    { tool_type:"dependency", config:{direction:"above",action:dependencyAction,exitQuantity:"full",quantityType:"qty"}, is_enabled:true, expected_version:existing["dependency"] },
  ]); toast("Tool defaults saved"); } catch { toast("Unable to save tool defaults", "error"); } finally { setSaving(false); } };
  const binary = <T extends string>(a:T,b:T,al:string,bl:string) => [{value:a,label:al},{value:b,label:bl}];
  return <AppShell title="Tool defaults" back="/more" width="narrow"><PageStack><p className="-mb-2 text-sm text-muted">Pre-fill these values for new drafts. Saved tools are never overwritten.</p>
    <Card><h2 className="mb-2 text-base font-semibold">Timed Exit</h2><SettingRow label="Default exit time"><input type="time" value={time} onChange={(e)=>setTime(e.target.value)} className="h-10 rounded-md border border-line-strong px-3 font-mono text-sm" /></SettingRow><SettingRow label="Default exit type"><Segmented options={binary("full","partial","Full Exit","Partial Exit")} value={exitType} onChange={setExitType} size="sm" /></SettingRow></Card>
    <Card><h2 className="mb-2 text-base font-semibold">Partial exits</h2><SettingRow label="F&O method"><Segmented options={binary("lots","qty","Lot-Based","Quantity-Based")} value={foMethod} onChange={setFoMethod} size="sm" /></SettingRow><SettingRow label="Stocks method"><Segmented options={binary("qty","pct","Quantity-Based","Percentage-Based")} value={stockMethod} onChange={setStockMethod} size="sm" /></SettingRow></Card>
    <Card><h2 className="mb-2 text-base font-semibold">Auto Trailing SL</h2><SettingRow label="Market move unit"><Segmented options={binary("pts","pct","Points","Percentage")} value={marketUnit} onChange={setMarketUnit} size="sm" /></SettingRow><SettingRow label="Move SL unit"><Segmented options={binary("pts","pct","Points","Percentage")} value={slUnit} onChange={setSlUnit} size="sm" /></SettingRow></Card>
    <Card><h2 className="mb-2 text-base font-semibold">No-Motion Exit</h2><SettingRow label="Reference price"><Segmented options={binary("entry","ltp","Entry Price","Current LTP")} value={refPrice} onChange={setRefPrice} size="sm" /></SettingRow><SettingRow label="Movement type"><Segmented options={binary("pts","pct","Points","Percentage")} value={moveType} onChange={setMoveType} size="sm" /></SettingRow></Card>
    <Card><h2 className="mb-2 text-base font-semibold">Range Break Exit</h2><SettingRow label="Trigger"><Segmented options={[{value:"touch",label:"Touch"},{value:"cross",label:"Cross"},{value:"close",label:"Candle Close"}]} value={rangeTrigger} onChange={setRangeTrigger} size="sm" /></SettingRow></Card>
    <Card><h2 className="mb-2 text-base font-semibold">Partial Profit Book</h2><SettingRow label="Number of targets"><Segmented options={[1,2,3,4,5].map((value)=>({value:String(value),label:String(value)}))} value={targetCount} onChange={setTargetCount} size="sm" /></SettingRow></Card>
    <Card><h2 className="mb-2 text-base font-semibold">MTM Lock</h2><SettingRow label="Progressive Lock by default"><Toggle checked={progressive} label="Progressive Lock" onChange={setProgressive} /></SettingRow></Card>
    <Card><h2 className="mb-2 text-base font-semibold">Time-Based Entry</h2><SettingRow label="Entry Ladder by default"><Toggle checked={ladder} label="Entry Ladder" onChange={setLadder} /></SettingRow></Card>
    <Card><h2 className="mb-2 text-base font-semibold">Dependency Entry / Exit</h2><SettingRow label="Default action"><Segmented options={binary("entry","exit","Entry","Exit")} value={dependencyAction} onChange={setDependencyAction} size="sm" /></SettingRow></Card>
    <div className="flex justify-end"><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save defaults"}</Button></div>
  </PageStack></AppShell>;
}
