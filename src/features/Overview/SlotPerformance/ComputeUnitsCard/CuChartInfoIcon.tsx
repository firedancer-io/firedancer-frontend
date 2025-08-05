import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Tooltip } from "@radix-ui/themes";
import styles from "./cuChartIcon.module.css";
import { startLineColor } from "../../../../colors";

export const infoIconId = "cu-chart-info-icon";

export const iconSize = 16;

export default function CuChartInfoIcon() {
  return (
    <div id={infoIconId} className={styles.iconContainer}>
      <Tooltip content="The 'revenue' scheduler strategy waits until 50ms remain in the block to schedule non-bundle user transactions">
        <InfoCircledIcon
          width={iconSize}
          height={iconSize}
          color={startLineColor}
        />
      </Tooltip>
    </div>
  );
}
