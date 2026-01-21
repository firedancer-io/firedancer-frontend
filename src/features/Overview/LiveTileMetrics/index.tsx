import { useAtomValue } from "jotai";
import {
  liveTileMetricsAtom,
  tilesAtom,
  tileTimerAtom,
} from "../../../api/atoms";
import Card from "../../../components/Card";
import { Flex, Table, Text } from "@radix-ui/themes";
import tableStyles from "../../Gossip/table.module.css";
import styles from "./liveTileMetrics.module.css";
import { Bars } from "../../StartupProgress/Firedancer/Bars";
import TileSparkLine from "../SlotPerformance/TileSparkLine";
import { headerGap } from "../../Gossip/consts";
import type { Tile, TileMetrics } from "../../../api/types";
import clsx from "clsx";
import {
  useHarmonicIntervalFn,
  usePrevious,
  usePreviousDistinct,
} from "react-use";
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { tileChartDarkBackground } from "../../../colors";
import { isEqual } from "lodash";
import type { CellProps } from "@radix-ui/themes/components/table";
import TableDescriptionDialog from "./TableDescriptionDialog";
import { metrics } from "./consts";

const chartHeight = 18;

export default function LiveTileMetrics() {
  return (
    <Card>
      <Flex direction="column" gap={headerGap} width="100%">
        <Flex align="center" gap="2">
          <Text className={tableStyles.headerText}>Tiles</Text>
          <TableDescriptionDialog />
        </Flex>
        <MLiveMetricTable />
      </Flex>
    </Card>
  );
}

const MLiveMetricTable = memo(function LiveMetricsTable() {
  const tiles = useAtomValue(tilesAtom);
  const liveTileMetrics = useAtomValue(liveTileMetricsAtom);

  if (!tiles || !liveTileMetrics) return;

  return (
    <Table.Root
      variant="ghost"
      className={clsx(tableStyles.root, styles.table)}
      size="1"
      style={
        {
          "--bar-height": `${chartHeight}px`,
        } as CSSProperties
      }
    >
      <colgroup>
        {metrics.map((metric) => (
          <col key={metric.name} style={{ width: metric.headerColWidth }} />
        ))}
      </colgroup>
      <Table.Header className={styles.header}>
        <Table.Row>
          {metrics.map((metric) => (
            <Table.ColumnHeaderCell
              key={metric.name}
              align={metric.headerColAlign}
            >
              {metric.name}
            </Table.ColumnHeaderCell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {tiles.map((tile, i) => (
          <TableRow
            key={`${tile.kind}${tile.kind_id}`}
            tile={tile}
            liveTileMetrics={liveTileMetrics}
            idx={i}
          />
        ))}
      </Table.Body>
    </Table.Root>
  );
});

interface TableRowProps {
  tile: Tile;
  liveTileMetrics: TileMetrics;
  idx: number;
}
function TableRow({ tile, liveTileMetrics, idx }: TableRowProps) {
  const prevLiveTileMetricsIdx = usePreviousDistinct(
    liveTileMetrics,
    (prev, next) => {
      if (!prev) return false;
      if (!next) return true;

      return Object.keys(next).every((key) => {
        return isEqual(
          prev[key as keyof typeof prev]?.[idx],
          next[key as keyof typeof next]?.[idx],
        );
      });
    },
  );

  const alive =
    liveTileMetrics.alive[idx] ?? prevLiveTileMetricsIdx?.alive[idx];
  const nivcsw =
    liveTileMetrics.nivcsw[idx] ?? prevLiveTileMetricsIdx?.nivcsw[idx];
  const nvcsw =
    liveTileMetrics.nvcsw[idx] ?? prevLiveTileMetricsIdx?.nvcsw[idx];
  const inBackpressure =
    liveTileMetrics.in_backp[idx] ?? prevLiveTileMetricsIdx?.in_backp[idx];
  const backPressureCount =
    liveTileMetrics.backp_msgs[idx] ?? prevLiveTileMetricsIdx?.backp_msgs[idx];

  const prevNivcsw = usePrevious(nivcsw);
  const prevNvcsw = usePrevious(nvcsw);
  const prevBackPressureCount = usePrevious(backPressureCount);

  // Meaning tile has shut down, no need to list it in the table
  if (alive === 2) return;

  const timers =
    liveTileMetrics.timers[idx] || prevLiveTileMetricsIdx?.timers[idx];

  if (!timers) return;

  for (let i = 0; i < timers.length; i++) {
    if (timers[i] === -1) timers[i] = 0;
  }

  const hKeepPct = timers[0] + timers[1] + timers[2];
  const waitPct = timers[6];
  const backpPct = timers[5];
  const workPct = timers[3] + timers[4] + timers[7];

  return (
    <Table.Row className={styles.row}>
      <Table.Cell>
        {tile.kind}:{tile.kind_id}
      </Table.Cell>
      <Table.Cell
        className={clsx({ [styles.green]: alive, [styles.red]: !alive })}
      >
        {alive ? "Live" : "Dead"}
      </Table.Cell>
      <Table.Cell align="right">
        {nivcsw?.toLocaleString() ?? "0"} |
        <IncrementText
          value={nivcsw != null && prevNivcsw != null ? nivcsw - prevNivcsw : 0}
        />
      </Table.Cell>
      <Table.Cell align="right">
        {nvcsw?.toLocaleString() ?? "0"} |
        <IncrementText
          value={nvcsw != null && prevNvcsw != null ? nvcsw - prevNvcsw : 0}
        />
      </Table.Cell>
      <Table.Cell className={clsx({ [styles.red]: inBackpressure })}>
        {inBackpressure ? "Yes" : "-"}
      </Table.Cell>
      <Table.Cell align="right">
        {backPressureCount?.toLocaleString() ?? "0"} |
        <Text
          className={clsx(styles.incrementText, {
            [styles.highIncrement]:
              backPressureCount != null && prevBackPressureCount != null
                ? backPressureCount - prevBackPressureCount
                : 0,
          })}
        >
          +
          {(backPressureCount != null && prevBackPressureCount != null
            ? backPressureCount - prevBackPressureCount
            : 0
          ).toLocaleString()}
        </Text>
      </Table.Cell>
      <MUtilization idx={idx} />
      <PctCell
        pct={hKeepPct}
        className={clsx({ [styles.red]: hKeepPct > 1 })}
      />
      <PctCell pct={waitPct} />
      <PctCell
        pct={backpPct}
        className={clsx({ [styles.red]: backpPct > 0 })}
      />
      <PctCell
        pct={workPct}
        className={styles.pctGradient}
        style={
          {
            "--pct": `${workPct}%`,
          } as CSSProperties
        }
      />
    </Table.Row>
  );
}

interface IncrementTextProps {
  value: number;
}
function IncrementText({ value }: IncrementTextProps) {
  const formatted = value.toLocaleString();
  return (
    <Text
      className={clsx(styles.incrementText, {
        [styles.lowIncrement]: 1 <= value && value <= 10,
        [styles.midIncrement]: 11 <= value && value <= 100,
        [styles.highIncrement]: value >= 101,
      })}
    >
      +{formatted}
    </Text>
  );
}

interface PctCellProps {
  pct: number;
}

function PctCell({ pct, ...props }: PctCellProps & CellProps) {
  return (
    <Table.Cell align="right" {...props}>
      {pct.toFixed(2)}%
    </Table.Cell>
  );
}

interface UtilizationProps {
  idx: number;
}

const updateIntervalMs = 300;

const MUtilization = memo(function Utilization({ idx }: UtilizationProps) {
  const tileTimers = useAtomValue(tileTimerAtom);
  const pct =
    tileTimers?.[idx] && tileTimers[idx] >= 0
      ? 1 - Math.max(0, tileTimers[idx])
      : -1;
  const prevPct = usePreviousDistinct(
    pct,
    (prev, next) =>
      !(
        next != null &&
        prev != null &&
        next >= 0 &&
        prev >= 0 &&
        next !== prev
      ),
  );
  const rollingSum = useRef({ count: 0, sum: 0 });
  const [avgValue, setAvgValue] = useState(pct);

  useEffect(() => {
    if (pct >= 0) {
      rollingSum.current.count++;
      rollingSum.current.sum += pct;
    }
  }, [pct]);

  useHarmonicIntervalFn(() => {
    if (rollingSum.current.count === 0) return;

    setAvgValue(rollingSum.current.sum / rollingSum.current.count);
    rollingSum.current = { count: 0, sum: 0 };
  }, updateIntervalMs);

  return (
    <>
      <Table.Cell className={styles.noPadding}>
        <Flex align="center">
          <Bars value={pct >= 0 ? pct : (prevPct ?? 0)} max={1} barWidth={2} />
        </Flex>
      </Table.Cell>
      <Table.Cell className={styles.noPadding}>
        <TileSparkLine
          value={avgValue}
          background={tileChartDarkBackground}
          windowMs={60_000}
          height={chartHeight}
          updateIntervalMs={updateIntervalMs}
          tickMs={1_000}
        />
      </Table.Cell>
    </>
  );
});
