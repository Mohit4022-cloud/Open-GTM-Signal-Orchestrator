import type { Temperature } from "@prisma/client";

import { Badge } from "@/components/shared/Badge";
import { getTemperatureTone } from "@/lib/badgeHelpers";
import { formatEnumLabel } from "@/lib/formatters/display";

type Props = {
  temperature: Temperature;
};

export function LeadTemperatureBadge({ temperature }: Props) {
  return (
    <Badge tone={getTemperatureTone(temperature)}>
      {formatEnumLabel(temperature)}
    </Badge>
  );
}
