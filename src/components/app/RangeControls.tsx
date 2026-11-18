import { RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIME_RANGES } from "@/lib/logs/meta";

export function RangeControls({ range, onRange, refresh, onRefresh }: { range: string; onRange: (v: string) => void; refresh?: number; onRefresh?: (v: number) => void }) {
  return (
    <>
      <Select value={range} onValueChange={onRange}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TIME_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {onRefresh && (
        <Select value={String(refresh ?? 0)} onValueChange={(v) => onRefresh(Number(v))}>
          <SelectTrigger className="w-40"><RefreshCw className="size-3.5" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Sem auto-refresh</SelectItem>
            {[10, 20, 30, 60].map((s) => <SelectItem key={s} value={String(s)}>A cada {s}s</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </>
  );
}
