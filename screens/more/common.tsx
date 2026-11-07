import type { ReactNode } from "react";

export function SettingRow({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={["flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between", className].join(" ")}><div className="min-w-0"><div className="text-sm font-medium text-ink">{label}</div>{hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}</div><div className="w-full sm:w-auto sm:min-w-48">{children}</div></div>;
}

export function SelectControl({ value, onChange, options, type = "text" }: { value: string; onChange: (v: string) => void; options: string[]; type?: string }) {
  return <select aria-label={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-primary-line sm:min-w-48">{options.map((item) => <option key={item} value={item}>{item}</option>)}</select>;
}

export function GroupHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{children}</h2>;
}

export function PageStack({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">{children}</div>;
}

export function FormCard({ children }: { children: ReactNode }) {
  return <section className="rounded-lg border border-line bg-surface p-4 shadow-card sm:p-5">{children}</section>;
}
