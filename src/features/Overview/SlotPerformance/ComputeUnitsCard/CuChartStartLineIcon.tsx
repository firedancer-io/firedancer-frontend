import { Tooltip } from "@radix-ui/themes";
import styles from "./cuChartIcon.module.css";
import { startLineColor } from "../../../../colors";
import { ScheduleStrategyEnum } from "../../../../api/entities";
import { scheduleStrategyIcons } from "../../../../strategyIcons";

export const startLineIconId = "cu-chart-info-icon";

export const iconSize = 16;

export default function CuChartStartLineIcon() {
  return (
    <div id={startLineIconId} className={styles.iconContainer}>
      <Tooltip content="The 'revenue' scheduler strategy waits until 50ms remain in the block to schedule non-bundle user transactions">
        <div
          style={{
            height: `${iconSize}px`,
            width: `${iconSize}px`,
            textAlign: "center",
          }}
          color={startLineColor}
        >
          {scheduleStrategyIcons[ScheduleStrategyEnum.revenue]}
        </div>
      </Tooltip>
    </div>
  );
}
