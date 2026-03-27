type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "danger";

export function getSegmentTone(segment: string): BadgeTone {
  switch (segment) {
    case "SMB":
      return "neutral";
    case "Mid Market":
      return "accent";
    case "Enterprise":
      return "warning";
    case "Strategic":
      return "positive";
    default:
      return "neutral";
  }
}

export function getLifecycleStageTone(stage: string): BadgeTone {
  switch (stage) {
    case "Prospect":
      return "neutral";
    case "Engaged":
      return "accent";
    case "Sales Ready":
      return "positive";
    case "Customer":
      return "warning";
    case "Nurture":
      return "danger";
    default:
      return "neutral";
  }
}

export function getStatusTone(status: string): BadgeTone {
  switch (status) {
    case "Hot":
      return "positive";
    case "Healthy":
      return "positive";
    case "Watch":
      return "warning";
    case "At Risk":
      return "danger";
    default:
      return "neutral";
  }
}

export function getTaskPriorityTone(priority: string): BadgeTone {
  switch (priority) {
    case "Urgent":
      return "danger";
    case "High":
      return "warning";
    case "Medium":
      return "accent";
    case "Low":
      return "neutral";
    default:
      return "neutral";
  }
}
