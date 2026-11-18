import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, icon: Icon, tone = "default", hint }: { label: string; value: string | number; icon: LucideIcon; tone?: "default" | "error" | "critical" | "warn" | "success"; hint?: string | undefined }) {
  const toneCls = { default: "text-primary", error: "text-sev-error", critical: "text-sev-critical", warn: "text-sev-warn", success: "text-success" }[tone];
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className={cn("size-4", toneCls)} />
      </div>
      <div className={cn("mt-2 font-mono text-2xl font-semibold tabular-nums", tone !== "default" && toneCls)}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Panel({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
