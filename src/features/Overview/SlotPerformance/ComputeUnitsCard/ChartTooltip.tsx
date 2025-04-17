import { TooltipProps } from "recharts";
import styles from "./computeUnits.module.css";
import { Text } from "@radix-ui/themes";
import clsx from "clsx";
import { getFmtStake } from "../../../../utils";

export default function ChartTooltip(props: TooltipProps<number, string>) {
  if (!props.active) return;

  return (
    <div className={styles.tooltip}>
      <Text className={clsx(styles.activeBanks, styles.label)}>
        Active banks
      </Text>
      <Text className={styles.activeBanks}>
        {props.payload?.[0]?.value ?? "-"}
      </Text>
      <Text className={clsx(styles.computeUnits, styles.label)}>
        Compute units
      </Text>
      <Text className={styles.computeUnits}>
        {props.payload?.[1]?.value?.toLocaleString() ?? "-"} CUs
      </Text>
      <Text className={clsx(styles.elapsedTime, styles.label)}>
        Time elapsed
      </Text>
      <Text className={styles.elapsedTime}>
        {(Number(props.label) / 1_000_000).toString()} ms
      </Text>
      <Text className={clsx(styles.tips, styles.label)}>Tips</Text>
      <Text className={styles.tips}>
        {getFmtStake(BigInt(props.payload?.[3]?.value || 0))}
      </Text>
      <Text className={clsx(styles.prioFee, styles.label)}>Prio Fee</Text>
      <Text className={styles.prioFee}>
        {getFmtStake(BigInt(props.payload?.[2]?.value || 0))}
      </Text>
    </div>
  );
}
