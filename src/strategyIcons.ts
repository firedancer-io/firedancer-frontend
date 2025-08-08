import { ScheduleStrategyEnum } from "./api/entities";
import type { ScheduleStrategy } from "./api/types";

export const scheduleStrategyIcons: { [key in ScheduleStrategy]: string } = {
  [ScheduleStrategyEnum.balanced]: "⚖️",
  [ScheduleStrategyEnum.perf]: "⚡",
  [ScheduleStrategyEnum.revenue]: "🚀",
};
