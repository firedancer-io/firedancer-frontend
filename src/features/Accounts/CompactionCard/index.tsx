import { memo } from "react";
import type { PropsWithChildren } from "react";
import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import Stat from "../Stat";
import PartitionUtilization from "../PartitionUtilization";
import { formatSIBytes, getSafePct } from "../../../utils";
import { accountsPartitionCompactionColor } from "../../../colors";
import styles from "./compactionCard.module.css";
import { PartitionTier } from "../consts";

function fmtPct(pct: number) {
  return `${Math.round(pct)}%`;
}

export default function CompactionCard({ className }: { className?: string }) {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const isCompacting = accountStats.compaction.in_compaction;
  const relocatedPerSec = formatSIBytes(
    accountStats.compaction.relocated_bytes_per_sec,
  );

  // TODO: calculate the next compaction time for all partitions
  // For now, assume the hot partition is the next to compact
  const nextCompactionPartition = accountStats.partitions?.find(
    (p) => p.tier === PartitionTier.Hot,
  );

  return (
    <Card className={className}>
      <Flex direction="column" minWidth="300px" height="100%" gap="5px">
        <CardHeader text="Compaction" />
        <Flex direction="column" gap="5px" height="100%">
          <Stat
            label="State"
            value={isCompacting ? "Compacting..." : "Idle"}
            color={isCompacting ? accountsPartitionCompactionColor : undefined}
            size="lg"
          />
          {nextCompactionPartition && (
            <NextCompactionPartitionUtilization
              usedFrac={nextCompactionPartition.used_frac}
              fragmentedFrac={nextCompactionPartition.fragmented_frac}
              compactionTriggerFrac={
                nextCompactionPartition.compaction_trigger_frac
              }
              compactionFrac={nextCompactionPartition.compaction_frac}
              compactionState={nextCompactionPartition.compaction_state}
              isWriteHead={nextCompactionPartition.is_write_head}
            />
          )}
        </Flex>
        <Flex justify="between" gap="5px">
          <Stat
            label="Relocated"
            value={`${relocatedPerSec.value} ${relocatedPerSec.unit}/s`}
          />
        </Flex>
      </Flex>
    </Card>
  );
}

interface NextCompactionProps {
  usedFrac: number;
  fragmentedFrac: number;
  compactionTriggerFrac: number;
  compactionFrac: number;
  compactionState: number;
  isWriteHead: boolean;
}

const NextCompactionPartitionUtilization = memo(
  function NextCompactionPartitionUtilization({
    usedFrac,
    fragmentedFrac,
    compactionTriggerFrac,
    compactionFrac,
    compactionState,
    isWriteHead,
  }: NextCompactionProps) {
    return (
      <Flex direction="column" gap="5px">
        <PartitionUtilization
          usedFrac={usedFrac}
          fragmentedFrac={fragmentedFrac}
          compactionTriggerFrac={compactionTriggerFrac}
          compactionFrac={compactionFrac}
          compactionState={compactionState}
          isWriteHead={isWriteHead}
          showPct={false}
        />
        <PartitionLegend
          usedFrac={usedFrac}
          fragmentedFrac={fragmentedFrac}
          compactionTriggerFrac={compactionTriggerFrac}
          compactionFrac={compactionFrac}
        />
      </Flex>
    );
  },
);

const PartitionLegend = memo(function PartitionLegend({
  usedFrac,
  fragmentedFrac,
  compactionTriggerFrac,
  compactionFrac,
}: {
  usedFrac: number;
  fragmentedFrac: number;
  compactionTriggerFrac: number;
  compactionFrac: number;
}) {
  const usedPct = fmtPct(usedFrac * 100);
  const fragPct = fmtPct(fragmentedFrac * 100);
  const triggerPct = fmtPct(compactionTriggerFrac * 100);
  const compactionPct = getSafePct(compactionFrac, usedFrac + fragmentedFrac);
  return (
    <Flex gap="10px">
      <LegendItem label="Used" value={usedPct}>
        <div className={styles.iconUsed} />
      </LegendItem>
      <LegendItem label="Frag" value={fragPct}>
        <div className={styles.iconFrag} />
      </LegendItem>
      <LegendItem label="Trigger" value={triggerPct}>
        <div className={styles.iconTrigger} />
      </LegendItem>
      <LegendItem
        label="Compact Head"
        value={compactionPct ? fmtPct(compactionPct) : ""}
      >
        <div>
          <div className={styles.compactHeadTriangle} />
          <div className={styles.compactHeadSquare} />
        </div>
      </LegendItem>
    </Flex>
  );
});

function LegendItem({
  children,
  label,
  value,
}: PropsWithChildren<{ label: string; value: string }>) {
  return (
    <Flex align="center" gap="1" className={styles.legendItem}>
      {children}
      <Text>{label}</Text>
      <Text className={styles.value}>{value}</Text>
    </Flex>
  );
}
