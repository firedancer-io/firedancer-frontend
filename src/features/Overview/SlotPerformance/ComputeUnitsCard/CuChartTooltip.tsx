import { useAtomValue } from "jotai";
import UplotTooltip from "../../../../uplotReact/UplotTooltip";
import { cuChartTooltipDataAtom } from "./atoms";
import styles from "./cuChartTooltip.module.css";
import { Text } from "@radix-ui/themes";
import clsx from "clsx";
import { getFmtStake } from "../../../../utils";
import { solDecimals } from "../../../../consts";

export default function CuChartTooltip() {
  const chartData = useAtomValue(cuChartTooltipDataAtom);
  return (
    <UplotTooltip elId="cu-chart-tooltip">
      {chartData && (
        <div className={styles.tooltip}>
          <Text className={clsx(styles.activeBanks, styles.label)}>
            Active&nbsp;banks
          </Text>
          <Text className={styles.activeBanks}>
            {chartData.activeBanks ?? "-"}
          </Text>
          <Text className={clsx(styles.computeUnits, styles.label)}>
            Compute&nbsp;units
          </Text>
          <Text className={styles.computeUnits}>
            {chartData.computeUnits?.toLocaleString() ?? "-"}&nbsp;CUs
          </Text>
          <Text className={clsx(styles.elapsedTime, styles.label)}>
            Time&nbsp;elapsed
          </Text>
          <Text className={styles.elapsedTime}>
            {chartData.elapsedTime != null
              ? `${(chartData.elapsedTime / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} ms`
              : "-"}
          </Text>
          <Text className={clsx(styles.tips, styles.label)}>Tips</Text>
          <Text className={styles.tips}>
            {getFmtStake(BigInt(chartData.tips || 0), solDecimals)}
          </Text>
          <Text className={clsx(styles.fees, styles.label)}>Fees</Text>
          <Text className={styles.fees}>
            {getFmtStake(BigInt(chartData.fees || 0), solDecimals)}
          </Text>
        </div>
      )}
    </UplotTooltip>
  );
}
