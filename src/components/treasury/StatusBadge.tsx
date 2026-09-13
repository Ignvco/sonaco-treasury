import { cn } from "@/lib/utils";
import { statusTone, type StatusTone } from "@/lib/status-tone";

const TONES: Record<StatusTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  muted: "bg-muted text-muted-foreground",
};

const DOTS: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-muted-foreground",
};

export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ label, tone, dot = true, className }: StatusBadgeProps) {
  const t = tone ?? statusTone(label);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        TONES[t],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[t])} />}
      {label}
    </span>
  );
}

export type { StatusTone } from "@/lib/status-tone";
