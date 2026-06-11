import { Flex, Table } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import DataTable from "../../../components/DataTable";
import tableStyles from "../../../components/dataTable.module.css";
import styles from "./tiles.module.css";
import { accountTileGroups } from "./consts";
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import type { AccountsStats } from "../../../api/types";
import {
  formatHitRate,
  formatRate,
  formatSIBytesRate,
  formatSIBytesStr,
} from "../../../utils";
import HistorySparkline from "./HistorySparkline";

export default function Tiles() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <Flex align="center" gap="5px">
          <CardHeader text="Tiles" />
          <TableDescriptionDialog groups={accountTileGroups} />
        </Flex>
        <DataTable
          groups={accountTileGroups}
          TableBody={TilesTableBody}
          hideGroupHeaders
        />
      </Flex>
    </Card>
  );
}

function TilesTableBody({ isPinned }: { isPinned?: boolean }) {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return null;

  return (
    <Table.Body>
      {accountStats.tiles.map((tile) =>
        isPinned ? (
          <PinnedRow key={`${tile.name}:${tile.kind_id}`} tile={tile} />
        ) : (
          <DataRow key={`${tile.name}:${tile.kind_id}`} tile={tile} />
        ),
      )}
    </Table.Body>
  );
}

type Tile = AccountsStats["tiles"][number];

function PinnedRow({ tile }: { tile: Tile }) {
  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell className={tableStyles.rightBorder}>
        {tile.name}:{tile.kind_id}
      </Table.Cell>
    </Table.Row>
  );
}

function DataRow({ tile }: { tile: Tile }) {
  const hasReads =
    tile.acquired_per_sec > 0 ||
    tile.acquired_writable_per_sec > 0 ||
    tile.read_ops_per_sec > 0;

  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell>{tile.joiner_type}</Table.Cell>
      <Table.Cell align="right">
        {hasReads ? (
          <span
            className={
              tile.hit_rate_ema >= 1
                ? tableStyles.green
                : tile.hit_rate_ema > 0.999
                  ? tableStyles.orange
                  : tableStyles.red
            }
          >
            {formatHitRate(tile.hit_rate_ema)}%
          </span>
        ) : (
          "-"
        )}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(tile.acquire_calls_per_sec)}
      </Table.Cell>
      <Table.Cell align="right" className={styles.read}>
        {formatRate(tile.acquired_per_sec)}
      </Table.Cell>
      <Table.Cell align="right" className={styles.write}>
        {formatRate(tile.acquired_writable_per_sec)}
      </Table.Cell>
      <Table.Cell>
        <HistorySparkline
          series={[
            {
              history: tile.acquired_history,
              color: "var(--accounts-read-color)",
            },
            {
              history: tile.acquired_writable_history,
              color: "var(--accounts-write-color)",
            },
          ]}
          height={12}
        />
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(tile.committed_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(tile.not_found_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">{formatRate(tile.evicted_per_sec)}</Table.Cell>
      <Table.Cell align="right" className={styles.read}>
        {formatSIBytesRate(tile.bytes_read_per_sec)}
      </Table.Cell>
      <Table.Cell align="right" className={styles.write}>
        {formatSIBytesRate(tile.bytes_written_per_sec)}
      </Table.Cell>
      <Table.Cell align="right" className={styles.read}>
        {formatSIBytesStr(tile.bytes_read)}
      </Table.Cell>
      <Table.Cell align="right" className={styles.write}>
        {formatSIBytesStr(tile.bytes_written)}
      </Table.Cell>
      <Table.Cell align="right">
        {tile.acquired ? tile.acquired.toLocaleString() : "-"}
      </Table.Cell>
    </Table.Row>
  );
}
