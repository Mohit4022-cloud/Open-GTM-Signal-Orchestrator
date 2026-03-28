import { Badge } from "@/components/shared/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoutingSimulatorClientView } from "@/components/routing-simulator/RoutingSimulatorClientView";

export default function RoutingSimulatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Policy testing"
        title="Routing Simulator"
        description="Configure a hypothetical routing context and run the live policy engine against it. Use this to verify rule precedence, capacity fallbacks, and SLA assignments before changes reach the working queue."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">Live engine</Badge>
            <Badge tone="neutral">No data written</Badge>
          </div>
        }
      />
      <RoutingSimulatorClientView />
    </div>
  );
}
