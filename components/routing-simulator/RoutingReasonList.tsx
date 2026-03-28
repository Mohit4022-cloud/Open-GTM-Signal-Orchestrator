import { Badge } from "@/components/shared/Badge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { getReasonCategoryTone } from "@/lib/badgeHelpers";
import { formatEnumLabel } from "@/lib/formatters/display";
import type { RoutingReasonDetailContract } from "@/lib/contracts/routing";

type RoutingReasonListProps = {
  details: RoutingReasonDetailContract[];
};

export function RoutingReasonList({ details }: RoutingReasonListProps) {
  return (
    <div>
      <SectionHeader label="Routing logic" title="Applied reason codes" />
      {details.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No reason details returned by this simulation run.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {details.map((detail) => (
            <li
              key={detail.code}
              className="flex items-start gap-3 rounded-2xl border border-border bg-panel-muted/70 px-4 py-3"
            >
              <Badge tone={getReasonCategoryTone(detail.category)}>
                {formatEnumLabel(detail.category)}
              </Badge>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {detail.label}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {detail.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
