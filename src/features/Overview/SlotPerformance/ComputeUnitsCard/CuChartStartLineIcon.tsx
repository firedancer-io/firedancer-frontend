import styles from "./cuChartIcon.module.css";
import { ScheduleStrategyEnum } from "../../../../api/entities";
import { ScheduleStrategyIcon } from "../../../../components/ScheduleStrategyIcon";

export const startLineIconId = "cu-chart-info-icon";

export const iconSize = 16;

export default function CuChartStartLineIcon() {
  return (
    <div id={startLineIconId} className={styles.iconContainer}>
      <ScheduleStrategyIcon
        strategy={ScheduleStrategyEnum.revenue}
        iconSize={iconSize}
        tooltipContent="The 'revenue' scheduler strategy waits until 50ms remain in the block to schedule non-bundle user transactions"
      />
    </div>
  );
}
