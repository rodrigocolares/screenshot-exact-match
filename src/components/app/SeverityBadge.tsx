import { cn } from "@/lib/utils";
import { SEVERITY_CLASS, SEVERITY_LABEL } from "@/lib/logs/meta";

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        SEVERITY_CLASS[severity] ?? SEVERITY_CLASS.INFO,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {SEVERITY_LABEL[severity] ?? severity}
    </span>
  );
}
