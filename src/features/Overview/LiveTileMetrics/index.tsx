import { useAtomValue } from "jotai";
import { tilesAtom } from "../../../api/atoms";
import { hasLiveTileMetricsAtom, tilePriorityCountsAtom } from "./atoms";
import Card from "../../../components/Card";
import { Flex, Table, Text } from "@radix-ui/themes";
import tableStyles from "../../../components/dataTable.module.css";
import styles from "./liveTileMetrics.module.css";
import { headerGap } from "../../Gossip/consts";
import type { Tile } from "../../../api/types";
import clsx from "clsx";
import { memo, useCallback, useMemo, useRef, type CSSProperties } from "react";
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import {
  chartHeight,
  metricGroups,
  pinnedGroups,
  pinnedTableWidth,
  unpinnedGroups,
} from "./consts";
import { PriorityEnum } from "../../../api/entities";
import { DataRow } from "./DataRow";
import { PinnedRow } from "./PinnedRow";
import { TableHeader } from "../../../components/DataTable";
import { areTilesEqual, getTileId } from "./utils";
import { toggleTileSelectedClass, useTileSelect } from "./useTileSelect";

export default memo(function LiveTileMetrics() {
  return (
    <Card>
      <Flex direction="column" gap={headerGap} width="100%">
        <Flex align="center" gap="2">
          <Text className={tableStyles.headerText}>Tiles</Text>
          <TableDescriptionDialog groups={metricGroups} />
        </Flex>
        <LiveMetricsTables />
      </Flex>
    </Card>
  );
});

function LiveMetricsTables() {
  const selectedTileRef = useRef<Tile | undefined>();
  const selectTile = useCallback((tile: Tile) => {
    if (selectedTileRef.current) {
      // deselect
      toggleTileSelectedClass(selectedTileRef.current, false);
    }

    selectedTileRef.current = tile;
    toggleTileSelectedClass(selectedTileRef.current, true);
  }, []);

  const initSelectedClass = useCallback((tile: Tile) => {
    // sync states if row was remounted
    const isSelected = areTilesEqual(selectedTileRef.current, tile);
    toggleTileSelectedClass(tile, isSelected);
  }, []);

  return (
    <Flex>
      <LiveMetricsTable
        isPinned={true}
        initSelectedClass={initSelectedClass}
        selectTile={selectTile}
      />
      <LiveMetricsTable
        isPinned={false}
        initSelectedClass={initSelectedClass}
        selectTile={selectTile}
      />
    </Flex>
  );
}

interface LiveMetricsTableProps {
  isPinned: boolean;
  initSelectedClass: (tile: Tile) => void;
  selectTile: (tile: Tile) => void;
}
function LiveMetricsTable({
  isPinned,
  initSelectedClass,
  selectTile,
}: LiveMetricsTableProps) {
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
      className={clsx(tableStyles.root, tableStyles.table)}
      size="1"
      style={rootStyle}
    >
      <TableHeader
        groups={groups}
        isPinned={isPinned}
        HeaderRenderer={PriorityCountCell}
      />
      <Table.Body>
        {tiles.map((tile, i) => (
          <TableRow
            key={getTileId(tile)}
            tile={tile}
            idx={i}
            isPinned={isPinned}
            initSelectedClass={initSelectedClass}
            selectTile={selectTile}
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
  initSelectedClass: (tile: Tile) => void;
  selectTile: (tile: Tile) => void;
}

const TableRow = memo(function TableRow({
  tile,
  idx,
  isPinned,
  initSelectedClass,
  selectTile,
}: TableRowProps) {
  const selectRowProps = useTileSelect(
    isPinned,
    tile,
    initSelectedClass,
    selectTile,
  );

  if (!isPinned) {
    return <DataRow idx={idx} selectTileProps={selectRowProps} />;
  }

  return <PinnedRow tile={tile} idx={idx} selectTileProps={selectRowProps} />;
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
