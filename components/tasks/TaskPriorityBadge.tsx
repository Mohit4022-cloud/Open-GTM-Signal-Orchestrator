import type { TaskPriorityCode } from "@/lib/contracts/actions";
import { Badge } from "@/components/shared/Badge";
import { getTaskPriorityTone } from "@/lib/badgeHelpers";

type Props = {
  priorityLabel: string;
  priorityCode: TaskPriorityCode;
};

export function TaskPriorityBadge({ priorityLabel, priorityCode }: Props) {
  return (
    <Badge tone={getTaskPriorityTone(priorityLabel)} title={priorityCode}>
      {priorityCode} · {priorityLabel}
    </Badge>
  );
}
