import { Badge } from "@/components/ui/badge";

export type FeatureStatus = "live" | "beta" | "planned";

interface StatusBadgeProps {
  status: FeatureStatus;
  className?: string;
}

const STATUS_CONFIG: Record<FeatureStatus, { label: string; className: string; variant?: "default" | "secondary" | "outline" | "destructive" | "success" | "warning" }> = {
  live: {
    label: "Live",
    className: "border-green-600 text-green-700 bg-green-50/50",
    variant: "outline",
  },
  beta: {
    label: "Beta",
    className: "border-amber-600 text-amber-700 bg-amber-50/50",
    variant: "outline",
  },
  planned: {
    label: "Planned",
    className: "border-muted-foreground/60 text-muted-foreground bg-muted/30",
    variant: "outline",
  },
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      variant={config.variant}
      className={`${config.className} ${className} text-[10px] font-medium px-2 py-0.5`}
    >
      {config.label}
    </Badge>
  );
}
