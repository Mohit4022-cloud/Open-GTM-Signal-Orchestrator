import { Route } from "lucide-react";

import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";

export function EmptyStateCard() {
  return (
    <Card className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span
        className="rounded-2xl border border-accent/15 bg-accent-muted p-4 text-accent"
        aria-hidden="true"
      >
        <Route className="size-8" />
      </span>
      <p className="mt-4 text-lg font-semibold text-foreground">
        Configure and run a simulation
      </p>
      <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
        Fill in any combination of routing context fields on the left and click
        Simulate. All fields are optional — the engine resolves the best policy
        match it can.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Badge tone="neutral">Named account flow</Badge>
        <Badge tone="neutral">Territory fallback</Badge>
        <Badge tone="neutral">Capacity override</Badge>
        <Badge tone="neutral">Ops queue path</Badge>
      </div>
    </Card>
  );
}
