import { memo } from "react";
import { Flex, Table, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import DataTable, { MemoCell } from "../../../components/DataTable";
import tableStyles from "../../../components/dataTable.module.css";
import accountStyles from "../accounts.module.css";
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
import { accountsReadColor, accountsWriteColor } from "../../../colors";

export default function Tiles() {
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
  if (!accountStats) return;

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

const PinnedRow = memo(
  function PinnedRow({ tile }: { tile: Tile }) {
    return (
      <Table.Row className={tableStyles.dataRow}>
        <MemoCell className={tableStyles.rightBorder}>
          {tile.name}:{tile.kind_id}
        </MemoCell>
      </Table.Row>
    );
  },
  (prev, next) =>
    prev.tile.name === next.tile.name &&
    prev.tile.kind_id === next.tile.kind_id,
);

function DataRow({ tile }: { tile: Tile }) {
  const hasReads =
    tile.acquired_per_sec > 0 ||
    tile.acquired_writable_per_sec > 0 ||
    tile.read_ops_per_sec > 0;

  return (
    <Table.Row className={tableStyles.dataRow}>
      <MemoCell>{tile.joiner_type}</MemoCell>
      <MemoCell align="right">
        {hasReads ? (
          <Text
            className={
              tile.hit_rate_ema >= 1
                ? tableStyles.green
                : tile.hit_rate_ema > 0.999
                  ? tableStyles.orange
                  : tableStyles.red
            }
          >
            {formatHitRate(tile.hit_rate_ema)}%
          </Text>
        ) : (
          "-"
        )}
      </MemoCell>
      <MemoCell align="right">
        {formatRate(tile.acquire_calls_per_sec)}
      </MemoCell>
      <MemoCell align="right" className={accountStyles.read}>
        {formatRate(
          Math.max(0, tile.acquired_per_sec - tile.acquired_writable_per_sec),
        )}
      </MemoCell>
      <MemoCell align="right" className={accountStyles.write}>
        {formatRate(tile.acquired_writable_per_sec)}
      </MemoCell>
      <MemoCell>
        <HistorySparkline
          series={[
            { history: tile.acquired_history, color: accountsReadColor },
            {
              history: tile.acquired_writable_history,
              color: accountsWriteColor,
            },
          ]}
        />
      </MemoCell>
      <MemoCell align="right">{formatRate(tile.committed_per_sec)}</MemoCell>
      <MemoCell align="right">{formatRate(tile.not_found_per_sec)}</MemoCell>
      <MemoCell align="right">{formatRate(tile.evicted_per_sec)}</MemoCell>
      <MemoCell align="right" className={accountStyles.read}>
        {formatSIBytesRate(tile.bytes_read_per_sec)}
      </MemoCell>
      <MemoCell align="right" className={accountStyles.write}>
        {formatSIBytesRate(tile.bytes_written_per_sec)}
      </MemoCell>
      <MemoCell align="right" className={accountStyles.read}>
        {formatSIBytesStr(tile.bytes_read)}
      </MemoCell>
      <MemoCell align="right" className={accountStyles.write}>
        {formatSIBytesStr(tile.bytes_written)}
      </MemoCell>
      <MemoCell align="right">
        {tile.acquired ? tile.acquired.toLocaleString() : "-"}
      </MemoCell>
    </Table.Row>
  );
}
