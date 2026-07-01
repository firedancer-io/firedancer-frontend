import { useAtomValue } from "jotai";
import { tilesAtom } from "../../../api/atoms";
import {
  hasLiveTileMetricsAtom,
  liveTileRowAtomFamily,
  tilePriorityCountsAtom,
} from "./atoms";
import Card from "../../../components/Card";
import { Flex, Table, Text } from "@radix-ui/themes";
import tableStyles from "../../Gossip/table.module.css";
import styles from "./liveTileMetrics.module.css";
import { headerGap } from "../../Gossip/consts";
import type { Tile } from "../../../api/types";
import clsx from "clsx";
import { usePreviousDistinct } from "react-use";
import { memo, useMemo, type CSSProperties } from "react";
import TableDescriptionDialog from "./TableDescriptionDialog";
import {
  chartHeight,
  pinnedGroups,
  pinnedTableWidth,
  unpinnedGroups,
} from "./consts";
import { PriorityEnum } from "../../../api/entities";
import { DataRow } from "./DataRow";

export default memo(function LiveTileMetrics() {
  return (
    <Card>
      <Flex direction="column" gap={headerGap} width="100%">
        <Flex align="center" gap="2">
          <Text className={tableStyles.headerText}>Tiles</Text>
          <TableDescriptionDialog />
        </Flex>
        <LiveMetricsTables />
      </Flex>
    </Card>
  );
});

function LiveMetricsTables() {
  return (
    <Flex>
      <LiveMetricsTable isPinned={true} />
      <LiveMetricsTable isPinned={false} />
    </Flex>
  );
}

interface LiveMetricsTableProps {
  isPinned: boolean;
}
function LiveMetricsTable({ isPinned }: LiveMetricsTableProps) {
  const tiles = useAtomValue(tilesAtom);
  const hasMetrics = useAtomValue(hasLiveTileMetricsAtom);

  const groups = isPinned ? pinnedGroups : unpinnedGroups;

  const rootStyle = useMemo(
    () =>
      ({
        "--bar-height": `${chartHeight}px`,
        minWidth: isPinned ? `${pinnedTableWidth}px` : "0px",
        flexBasis: isPinned ? `${pinnedTableWidth}px` : undefined,
      }) as CSSProperties,
    [isPinned],
  );

  if (!tiles || !hasMetrics) return;

  return (
    <Table.Root
      variant="ghost"
      className={clsx(tableStyles.root, styles.table)}
      size="1"
      style={rootStyle}
    >
      <colgroup>
        {groups.map((group) =>
          group.metrics.map((metric) => (
            <col
              key={metric.uniqueName}
              style={{ width: metric.headerColWidth }}
            />
          )),
        )}
      </colgroup>

      <Table.Header className={styles.header}>
        <Table.Row>
          {groups.map((group, i) => (
            <Table.ColumnHeaderCell
              key={group.name}
              colSpan={group.metrics.length}
              className={clsx(styles.groupHeader, {
                [styles.rightBorder]: isPinned || i !== groups.length - 1,
              })}
            >
              {group.name || <PriorityCountCell />}
            </Table.ColumnHeaderCell>
          ))}
        </Table.Row>

        <Table.Row className={styles.lightBorderBottom}>
          {groups.map((group, i) =>
            group.metrics.map((metric, j) => (
              <Table.ColumnHeaderCell
                key={metric.uniqueName}
                align={metric.headerColAlign}
                className={clsx({
                  [styles.wrap]: !!metric.wrap,
                  [styles.rightBorder]:
                    isPinned ||
                    // last metric (except in last group) has right border
                    (i !== groups.length - 1 && j === group.metrics.length - 1),
                })}
              >
                {metric.columnName ?? metric.uniqueName}
              </Table.ColumnHeaderCell>
            )),
          )}
        </Table.Row>
      </Table.Header>

      <Table.Body>
        {tiles.map((tile, i) => (
          <TableRow
            key={`${tile.kind}${tile.kind_id}`}
            tile={tile}
            idx={i}
            isPinned={isPinned}
          />
        ))}
      </Table.Body>
    </Table.Root>
  );
}

interface TableRowProps {
  tile: Tile;
  idx: number;
  isPinned: boolean;
}
const TableRow = memo(function TableRow({
  tile,
  idx,
  isPinned,
}: TableRowProps) {
  if (!isPinned) {
    return <DataRow idx={idx} />;
  }

  return <PinnedTableRow tile={tile} idx={idx} />;
});

interface PinnedTableRowProps {
  tile: Tile;
  idx: number;
}
const PinnedTableRow = memo(function PinnedTableRow({
  tile,
  idx,
}: PinnedTableRowProps) {
  const cur = useAtomValue(liveTileRowAtomFamily(idx));
  const prev = usePreviousDistinct(cur);

  const alive = cur?.alive ?? prev?.alive;
  // Meaning tile has shut down, no need to list it in the table
  if (alive === 2) return;

  const timers = cur?.timers || prev?.timers;
  if (!timers) return;

  const isFloating =
    (cur?.priority ?? prev?.priority) === PriorityEnum.floating;

  return (
    <Table.Row
      className={clsx(styles.dataRow, { [styles.floating]: isFloating })}
    >
      <Table.Cell className={styles.rightBorder}>
        {tile.kind}:{tile.kind_id}
      </Table.Cell>
    </Table.Row>
  );
});

function PriorityCountCell() {
  const data = useAtomValue(tilePriorityCountsAtom);
  const priority = data?.priority;
  const alive = data?.alive;
  const counts = useMemo(() => {
    if (!priority || !alive) return null;

    let critical = 0;
    let pinned = 0;
    let floating = 0;

    for (let i = 0; i < priority.length; i++) {
      // shutdown tiles are not displayed in the table, so exclude them from the count
      const isShutdown = alive[i] === 2;
      if (isShutdown) continue;

      switch (priority[i]) {
        case PriorityEnum.critical:
          critical++;
          break;
        case PriorityEnum.normal:
        case PriorityEnum.startup:
          pinned++;
          break;
        case PriorityEnum.floating:
          floating++;
          break;
      }
    }

    return { critical, pinned, floating };
  }, [alive, priority]);

  if (!counts) return;

  return (
    <Flex className={styles.priorityCount} gap="5px" justify="between">
      <Text>
        {counts.critical} <Text className={styles.critical}>C</Text>
      </Text>
      <Text>
        {counts.pinned} <Text className={styles.pinned}>P</Text>
      </Text>
      <Text>
        {counts.floating} <Text className={styles.floating}>F</Text>
      </Text>
    </Flex>
  );
}
