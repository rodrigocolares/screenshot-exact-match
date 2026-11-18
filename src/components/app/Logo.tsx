import { Radar } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 place-items-center rounded-md bg-gradient-primary text-primary-foreground shadow-glow">
        <Radar className="size-4.5" strokeWidth={2.4} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight">
            LogSentinel <span className="text-gradient-primary">AI</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Log Intelligence</div>
        </div>
      )}
    </div>
  );
}
