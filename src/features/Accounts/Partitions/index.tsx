import { Flex, Table } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import DataTable from "../../../components/DataTable";
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import { partitionGroups } from "./consts";
import type { AccountsStats } from "../../../api/types";
import tableStyles from "../../../components/dataTable.module.css";
import styles from "./partitions.module.css";
import { formatRate, formatSIBytes, formatSIBytesRate } from "../../../utils";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors";
import UsageBar from "./UsageBar";

export default function Partitions() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <Flex align="center" gap="5px">
          <CardHeader text="Partitions" />
          <TableDescriptionDialog groups={partitionGroups} />
        </Flex>
        <DataTable
          groups={partitionGroups}
          TableBody={PartitionsTableBody}
          hideGroupHeaders
        />
      </Flex>
    </Card>
  );
}

function PartitionsTableBody({ isPinned }: { isPinned?: boolean }) {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return null;

  return (
    <Table.Body>
      {[...accountStats.partitions]
        .reverse()
        .map((partition) =>
          isPinned ? (
            <PinnedRow key={partition.partition_idx} partition={partition} />
          ) : (
            <DataRow key={partition.partition_idx} partition={partition} />
          ),
        )}
    </Table.Body>
  );
}

type Partition = AccountsStats["partitions"][number];

const TIER_LABELS: Record<number, string> = {
  0: "Hot",
  1: "Warm",
  2: "Cold",
  255: "Off",
};

const TIER_COLORS: Record<number, string> = {
  0: "var(--red-9)",
  1: "var(--orange-9)",
  2: "var(--blue-8)",
};

function PinnedRow({ partition }: { partition: Partition }) {
  const offset = formatSIBytes(partition.file_offset, 0);
  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell align="right">{partition.partition_idx}</Table.Cell>
      <Table.Cell align="right">{`${offset.value} ${offset.unit}`}</Table.Cell>
      <Table.Cell
        align="right"
        className={tableStyles.rightBorder}
        style={{ color: TIER_COLORS[partition.tier] }}
      >
        {TIER_LABELS[partition.tier] ?? partition.tier}
      </Table.Cell>
    </Table.Row>
  );
}

function DataRow({ partition }: { partition: Partition }) {
  const isCompacting = partition.compaction_state === 2;
  const region = partition.used_frac + partition.fragmented_frac;
  const compactionPct =
    isCompacting && region > 0
      ? Math.min(100, (partition.compaction_frac / region) * 100)
      : 0;

  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell className={styles.usageCol}>
        <UsageBar
          usedFrac={partition.utilization}
          fragmentedFrac={partition.fragmented_frac}
          compactionTriggerFrac={partition.compaction_trigger_frac}
          isWriteHead={partition.is_write_head}
          compactionFrac={partition.compaction_frac}
          compactionState={partition.compaction_state}
        />
      </Table.Cell>
      <Table.Cell
        align="right"
        style={{
          color: `color-mix(in srgb, ${tileBusyGreenColor}, ${tileBusyRedColor} ${Math.round(partition.fragmentation * 100)}%)`,
        }}
      >
        {`${Math.round(partition.fragmentation * 100)}%`}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(partition.read_ops_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(partition.write_ops_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatSIBytesRate(partition.bytes_read_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatSIBytesRate(partition.bytes_written_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {isCompacting ? `${compactionPct.toFixed(1)}%` : "-"}
      </Table.Cell>
      <Table.Cell align="right">
        {formatDuration(partition.age_seconds)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatDuration(partition.filled_seconds)}
      </Table.Cell>
    </Table.Row>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 0) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
