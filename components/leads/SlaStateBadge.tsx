import type { SlaCurrentState } from "@/lib/contracts/sla";
import { Badge } from "@/components/shared/Badge";
import { getSlaStateTone } from "@/lib/badgeHelpers";
import { formatEnumLabel } from "@/lib/formatters/display";

type Props = {
  state: SlaCurrentState;
};

export function SlaStateBadge({ state }: Props) {
  return (
    <Badge tone={getSlaStateTone(state)}>
      {formatEnumLabel(state)}
    </Badge>
  );
}
