import { Tooltip, Flex, Text } from "@radix-ui/themes";
import { accountsPartitionCompactionColor } from "../../colors";
import styles from "./partitionUtilization.module.css";
import type { PropsWithChildren } from "react";
import type { AccountsStats } from "../../api/types";

function fmtPct(pct: number) {
  return `${pct.toFixed(2)}%`;
}

export default function PartitionUtilization({
  partition,
  showPct = true,
}: {
  partition: AccountsStats["partitions"][number];
  showPct?: boolean;
}) {
  const fragPct = partition.fragmented_frac * 100;
  const usedPct = partition.used_frac * 100;
  const headPct = fragPct + usedPct;
  const unusedPct = 100 - headPct;
  const compactionTriggerPct = partition.compaction_trigger_frac * 100;
  const compactionPct = partition.compaction_frac * 100;
  const isCompacting = partition.compaction_state === 2;

  return (
    <PartitionUtilizationTooltip
      fragmentedFrac={partition.fragmented_frac}
      compactionTriggerFrac={partition.compaction_trigger_frac}
      headPct={headPct}
    >
      <Flex align="center" gap="8px">
        <Flex position="relative" flexGrow="1">
          <Flex
            className={styles.triggerMarker}
            left={fmtPct(compactionTriggerPct)}
          />
          {partition.is_write_head && (
            <Flex className={styles.writeHeadMarker} left={fmtPct(headPct)} />
          )}
          {isCompacting && (
            <Flex
              className={styles.compactionMarker}
              left={fmtPct(compactionPct)}
            />
          )}

          <Flex className={styles.track} flexGrow="1" height="12px">
            <Flex width={fmtPct(fragPct)} className={styles.fragmented} />
            <Flex width={fmtPct(usedPct)} className={styles.used} />
            <Flex width={fmtPct(unusedPct)} className={styles.unused} />
            {isCompacting && (
              <Flex
                className={styles.compactionOverlay}
                width={fmtPct(compactionPct)}
              />
            )}
          </Flex>
        </Flex>

        {showPct && (
          <Text className={styles.usageText}>{Math.round(headPct)}%</Text>
        )}
      </Flex>
    </PartitionUtilizationTooltip>
  );
}

interface PartitionUtilizationTooltipProps {
  fragmentedFrac: number;
  compactionTriggerFrac: number;
  headPct: number;
}

function PartitionUtilizationTooltip({
  fragmentedFrac,
  compactionTriggerFrac,
  headPct,
  children,
}: PropsWithChildren<PartitionUtilizationTooltipProps>) {
  return (
    <Tooltip
      content={
        <Flex direction="column" gap="2px">
          <Text weight="bold">Compaction Conditions</Text>
          <Text
            style={{
              color:
                headPct === 100 ? accountsPartitionCompactionColor : undefined,
            }}
          >
            Filled: {fmtPct(headPct)} / 100.00%
          </Text>
          <Text
            style={{
              color:
                fragmentedFrac >= compactionTriggerFrac
                  ? accountsPartitionCompactionColor
                  : undefined,
            }}
          >
            Fragmentation: {fmtPct(fragmentedFrac * 100)} /{" "}
            {fmtPct(compactionTriggerFrac * 100)}
          </Text>
        </Flex>
      }
      side="right"
    >
      {children}
    </Tooltip>
  );
}
