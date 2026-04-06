import { Box, Flex, Text } from "@radix-ui/themes";
import styles from "./supermajority.module.css";
import supermajorityPointerIcon from "../../../../assets/supermajority_pointer.svg";
import { useMemo, type CSSProperties } from "react";
import { clamp } from "lodash";
import clsx from "clsx";
import { bootProgressAtom } from "../../../../api/atoms";
import { useAtomValue } from "jotai";
import { lamportsPerSol } from "../../../../consts";

interface SupermajorityPieChartProps {
  stakeFraction: number;
}
export default function SupermajorityPieChart(
  props: SupermajorityPieChartProps,
) {
  return (
    <Flex
      maxWidth="412px"
      width="100%"
      maxHeight="100%"
      direction="column"
      align="center"
      gapY="10px"
    >
      <Text className={styles.pieChartTitle}>Stake Online</Text>
      <Flex className={styles.pieChartSquareContainer} flexGrow="1">
        <PieChart {...props} />
      </Flex>
    </Flex>
  );
}

/**
 * Pie chart that grows to fill container
 */
function PieChart({ stakeFraction }: SupermajorityPieChartProps) {
  const bootProgress = useAtomValue(bootProgressAtom);

  const totalStake = useMemo(
    () => formatStake(bootProgress?.wait_for_supermajority_total_stake),
    [bootProgress?.wait_for_supermajority_total_stake],
  );

  const connectedStake = formatStake(
    bootProgress?.wait_for_supermajority_connected_stake,
  );

  if (!bootProgress) return null;

  return (
    <Flex
      height="100%"
      width="100%"
      position="relative"
      align="center"
      justify="center"
      className={styles.pieChart}
      style={
        {
          "--progress-pct": `${Math.round(clamp(stakeFraction, 0, 1) * 100)}%`,
        } as CSSProperties
      }
    >
      <Flex
        direction="column"
        position="absolute"
        height="50%"
        width="0px"
        bottom="0"
        left="50%"
        align="center"
        className={styles.thresholdMarker}
        gap="1px"
      >
        <Box className={styles.markerLine} height="100%" flexShrink="0" />
        <img
          className={styles.markerIcon}
          src={supermajorityPointerIcon}
          alt="80% supermajority pointer"
        />
      </Flex>

      <Flex
        direction="column"
        position="relative"
        height="70%"
        width="70%"
        align="center"
        justify="center"
        gapY="4%"
        className={styles.pieChartContent}
      >
        <Text>
          <Text weight="bold" className={styles.lg}>
            {(stakeFraction * 100).toFixed(2)}
          </Text>
          <Text weight="bold" className={styles.secondaryColor}>
            {" %"}
          </Text>
          <Text className={styles.lg}> / </Text>
          <Text weight="bold" className={clsx(styles.lg, styles.eighty)}>
            80
          </Text>
          <Text weight="bold" color="bronze">
            {" %"}
          </Text>
        </Text>

        <Text>
          {connectedStake?.formatted ?? "--"}
          {connectedStake?.suffix && (
            <Text className={styles.secondaryColor}>
              {" "}
              {connectedStake?.suffix}
            </Text>
          )}
          {" / "}
          <Text>{totalStake?.formatted ?? "--"}</Text>
          {totalStake?.suffix && (
            <Text className={styles.secondaryColor}> {totalStake?.suffix}</Text>
          )}
        </Text>
      </Flex>
    </Flex>
  );
}

const stakeFormatter = Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  minimumSignificantDigits: 3,
  maximumSignificantDigits: 3,
});

function formatStake(lamport: bigint | null | undefined) {
  if (lamport == null) return;

  const parts = stakeFormatter.formatToParts(Number(lamport) / lamportsPerSol);
  let formatted = "";
  let suffix = undefined;
  for (const { value, type } of parts) {
    if (type === "compact") {
      suffix = value;
    } else {
      formatted += value;
    }
  }

  return {
    formatted,
    suffix,
  };
}
