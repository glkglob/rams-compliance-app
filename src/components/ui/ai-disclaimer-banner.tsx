import { AlertTriangle } from "lucide-react";

export function AiDisclaimerBanner() {
  return (
    <div
      role="status"
      aria-label="AI disclaimer"
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-sm font-medium">
          AI highlights potential gaps only. Final decisions must be recorded by an authorised reviewer.
        </p>
      </div>
    </div>
  );
}
