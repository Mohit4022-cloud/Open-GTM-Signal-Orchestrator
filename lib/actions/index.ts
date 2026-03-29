export {
  createManualTask,
  createTaskFromTemplate,
  generateActionsForAccount,
  generateActionsForAccountWithClient,
  generateActionsForLead,
  generateActionsForLeadWithClient,
  updateTask,
} from "./service";
export { createLeadSlaEscalationTaskWithClient } from "./escalations";
export {
  getActionRecommendationsForEntity,
  getDashboardTaskSummary,
  getRecommendationsList,
  getTaskById,
  getTaskQueue,
  getTasks,
  getTasksForAccount,
  getTasksForLead,
} from "./queries";
