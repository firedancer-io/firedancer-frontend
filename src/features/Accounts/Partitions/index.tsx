import { Flex, Table } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import DataTable from "../../../components/DataTable";
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import { partitionGroups } from "./consts";
import { partitionTierLabel, partitionTierColor } from "../consts";
import type { AccountsStats } from "../../../api/types";
import tableStyles from "../../../components/dataTable.module.css";
import accountStyles from "../accounts.module.css";
import { formatRate, formatSIBytes, formatSIBytesRate } from "../../../utils";
import PartitionUtilization from "../PartitionUtilization";

type Partition = AccountsStats["partitions"][number];

export default function Partitions() {
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
  if (!accountStats) return;

  return (
    <Table.Body>
      {accountStats.partitions
        .toReversed()
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

function PinnedRow({ partition }: { partition: Partition }) {
  const offset = formatSIBytes(partition.file_offset, 0);

  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell align="right">{partition.partition_idx}</Table.Cell>
      <Table.Cell align="right">{`${offset.value} ${offset.unit}`}</Table.Cell>
      <Table.Cell
        align="right"
        className={tableStyles.rightBorder}
        style={{ color: partitionTierColor[partition.tier] }}
      >
        {partitionTierLabel[partition.tier] ?? partition.tier}
      </Table.Cell>
    </Table.Row>
  );
}

function DataRow({ partition }: { partition: Partition }) {
  const isCompacting = partition.compaction_state === 2;
  const filledFrac = partition.used_frac + partition.fragmented_frac;
  const compactionPct =
    isCompacting && filledFrac > 0
      ? Math.min(100, (partition.compaction_frac / filledFrac) * 100)
      : 0;

  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell>
        <PartitionUtilization partition={partition} />
      </Table.Cell>
      <Table.Cell align="right">
        {`${Math.round(partition.fragmented_frac * 100)}%`}
      </Table.Cell>
      <Table.Cell align="right" className={accountStyles.read}>
        {formatRate(partition.read_ops_per_sec)}
      </Table.Cell>
      <Table.Cell align="right" className={accountStyles.write}>
        {formatRate(partition.write_ops_per_sec)}
      </Table.Cell>
      <Table.Cell align="right" className={accountStyles.read}>
        {formatSIBytesRate(partition.bytes_read_per_sec)}
      </Table.Cell>
      <Table.Cell align="right" className={accountStyles.write}>
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
