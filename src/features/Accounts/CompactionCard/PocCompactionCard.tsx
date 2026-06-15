import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import Stat from "../Stat";
import UsageBar from "../Partitions/UsageBar";
import { formatSIBytes } from "../../../utils";
import type { AccountsStats } from "../../../api/types";

import styles from "./compactionCard.module.css";

type Partition = AccountsStats["partitions"][number];

function estimateNextCompaction(partition: Partition | undefined): string {
  if (!partition) return "-";
  if (partition.compaction_state === 2) return "Now";

  const fragRemaining =
    partition.compaction_trigger_frac - partition.fragmented_frac;
  if (fragRemaining <= 0) return "Unknown";

  const fragRate =
    partition.age_seconds > 0
      ? partition.fragmented_frac / partition.age_seconds
      : 0;
  if (fragRate <= 0) return "-";

  return formatDuration(fragRemaining / fragRate);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default function PocCompactionCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const isCompacting = accountStats.compaction.in_compaction;
  const hotPartition = accountStats.partitions?.find((p) => p.tier === 0);
  const relocatedPerSec = formatSIBytes(
    accountStats.compaction.relocated_bytes_per_sec,
  );

  const nextCompactionLabel = estimateNextCompaction(hotPartition);

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <Flex align="baseline" gap="5px">
          <CardHeader text="Compaction" />
          <CardHeader
            className={isCompacting ? styles.inProgress : styles.idle}
            text={isCompacting ? "In Progress" : "Idle"}
          />
          <Text size="1" style={{ color: "var(--gray-9)", marginLeft: "auto" }}>
            {`${relocatedPerSec.value} ${relocatedPerSec.unit}/s relocated`}
          </Text>
        </Flex>
        <Flex direction="column">
          <Stat
            value={accountStats.compaction.compactions_completed.toLocaleString()}
            size="lg"
            suffix={`/ ${accountStats.compaction.compactions_requested} Completed`}
          />
          {hotPartition ? (
            <Flex direction="column" gap="4px">
              <Text
                size="3"
                weight="medium"
                style={{ color: "var(--gray-11)" }}
              >
                {`Hot Partition #${hotPartition.partition_idx}`}
              </Text>
              <UsageBar
                usedFrac={hotPartition.used_frac}
                fragmentedFrac={hotPartition.fragmented_frac}
                compactionTriggerFrac={hotPartition.compaction_trigger_frac}
                isWriteHead={hotPartition.is_write_head}
                compactionFrac={hotPartition.compaction_frac}
                compactionState={hotPartition.compaction_state}
              />
              <PartitionLegend partition={hotPartition} />
            </Flex>
          ) : (
            <Text size="1" style={{ color: "var(--gray-8)" }}>
              No hot partition
            </Text>
          )}
        </Flex>
        <Stat
          label="Next Compaction in"
          value={nextCompactionLabel}
          color="var(--gray-12)"
        />
      </Flex>
    </Card>
  );
}

function PartitionLegend({ partition }: { partition: Partition }) {
  const fragPct = partition.fragmented_frac * 100;
  const triggerPct = partition.compaction_trigger_frac * 100;
  const isCompacting = partition.compaction_state === 2;
  const compactionPct =
    isCompacting && partition.used_frac + partition.fragmented_frac > 0
      ? Math.min(
          100,
          (partition.compaction_frac /
            (partition.used_frac + partition.fragmented_frac)) *
            100,
        )
      : null;

  return (
    <Flex gap="10px" wrap="wrap">
      <LegendItem
        color="var(--blue-9)"
        label="Used"
        value={`${(partition.used_frac * 100).toFixed(1)}%`}
      />
      <LegendItem
        color="var(--orange-9)"
        label="Frag"
        value={`${fragPct.toFixed(1)}%`}
      />
      <LegendItem
        color="var(--yellow-9)"
        label="Trigger"
        value={`${triggerPct.toFixed(1)}%`}
        marker
      />
      {compactionPct !== null && (
        <LegendItem
          color="rgba(255,255,255,0.2)"
          label="Compacted"
          value={`${compactionPct.toFixed(1)}%`}
        />
      )}
    </Flex>
  );
}

function LegendItem({
  color,
  label,
  value,
  marker,
}: {
  color: string;
  label: string;
  value: string;
  marker?: boolean;
}) {
  return (
    <Flex align="center" gap="1">
      <div
        style={{
          width: marker ? 2 : 7,
          height: marker ? 10 : 7,
          borderRadius: marker ? 1 : 2,
          background: color,
          flexShrink: 0,
        }}
      />
      <Text size="1" style={{ color: "var(--gray-9)" }}>
        {label}
      </Text>
      <Text size="1" style={{ color: "var(--gray-11)" }}>
        {value}
      </Text>
    </Flex>
  );
}
