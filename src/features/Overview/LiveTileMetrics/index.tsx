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
import {
  memo,
  useMemo,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from "react";
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
import { useTileHover } from "./useTileHover";

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
  const hoveredIdxRef = useRef<number | undefined>();

  return (
    <Flex>
      <LiveMetricsTable isPinned={true} hoveredIdxRef={hoveredIdxRef} />
      <LiveMetricsTable isPinned={false} hoveredIdxRef={hoveredIdxRef} />
    </Flex>
  );
}

interface LiveMetricsTableProps {
  isPinned: boolean;
  hoveredIdxRef: MutableRefObject<number | undefined>;
}
function LiveMetricsTable({ isPinned, hoveredIdxRef }: LiveMetricsTableProps) {
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
            key={`${tile.kind}${tile.kind_id}`}
            tile={tile}
            idx={i}
            isPinned={isPinned}
            hoveredIdxRef={hoveredIdxRef}
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
  hoveredIdxRef: MutableRefObject<number | undefined>;
}

const TableRow = memo(function TableRow({
  tile,
  idx,
  isPinned,
  hoveredIdxRef,
}: TableRowProps) {
  const hoverProps = useTileHover(isPinned, idx, hoveredIdxRef);

  if (!isPinned) {
    return <DataRow idx={idx} hoverProps={hoverProps} />;
  }

  return <PinnedRow tile={tile} idx={idx} hoverProps={hoverProps} />;
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
