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
import { useHarmonicIntervalFn, usePreviousDistinct } from "react-use";
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import useIsVisible from "../../../hooks/useIsVisible";
import { tileChartDarkBackground } from "../../../colors";
import TableDescriptionDialog from "./TableDescriptionDialog";
import { metrics } from "./consts";

const numFmt = new Intl.NumberFormat();

const chartHeight = 18;

export default function LiveTileMetrics() {
  const visibilityRef = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(visibilityRef);

  return (
    <div ref={visibilityRef}>
      <Card>
        <Flex direction="column" gap={headerGap} width="100%">
          <Flex align="center" gap="2">
            <Text className={tableStyles.headerText}>Tiles</Text>
            <TableDescriptionDialog />
          </Flex>
          {isVisible && <MLiveMetricTable />}
        </Flex>
      </Card>
    </div>
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
              className={clsx({
                [styles.wrap]: !!metric.wrap,
              })}
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

const R = "rt-TableCell";

function incrClass(v: number): string {
  if (v >= 101) return `${styles.incrementText} ${styles.highIncrement}`;
  if (v >= 11) return `${styles.incrementText} ${styles.midIncrement}`;
  if (v >= 1) return `${styles.incrementText} ${styles.lowIncrement}`;
  return styles.incrementText;
}

function TableRow({ tile, liveTileMetrics, idx }: TableRowProps) {
  const ref = useRef<{
    alive?: number | null;
    nivcsw?: number | null;
    nvcsw?: number | null;
    in_backp?: boolean | null;
    backp_msgs?: number | null;
    last_cpu?: number | null;
    minflt?: number | null;
    majflt?: number | null;
    timers?: number[] | null;
    sched_timers?: number[] | null;
    pNivcsw?: number | null;
    pNvcsw?: number | null;
    pBackp?: number | null;
  }>({});
  const s = ref.current;

  const alive = liveTileMetrics.alive[idx] ?? s.alive;
  const nivcsw = liveTileMetrics.nivcsw[idx] ?? s.nivcsw;
  const nvcsw = liveTileMetrics.nvcsw[idx] ?? s.nvcsw;
  const inBackpressure = liveTileMetrics.in_backp[idx] ?? s.in_backp;
  const backPressureCount = liveTileMetrics.backp_msgs[idx] ?? s.backp_msgs;
  const cpu = liveTileMetrics.last_cpu[idx] ?? s.last_cpu;
  const minflt = liveTileMetrics.minflt[idx] ?? s.minflt;
  const majflt = liveTileMetrics.majflt[idx] ?? s.majflt;
  const rawTimers = liveTileMetrics.timers[idx] ?? s.timers;
  const rawSchedTimers = liveTileMetrics.sched_timers[idx] ?? s.sched_timers;

  // Compute deltas from committed previous values
  const nivcswDelta =
    nivcsw != null && s.pNivcsw != null ? nivcsw - s.pNivcsw : 0;
  const nvcswDelta = nvcsw != null && s.pNvcsw != null ? nvcsw - s.pNvcsw : 0;
  const backpDelta =
    backPressureCount != null && s.pBackp != null
      ? backPressureCount - s.pBackp
      : 0;

  // Update fallback values during render (idempotent, safe for StrictMode)
  if (liveTileMetrics.alive[idx] != null) s.alive = liveTileMetrics.alive[idx];
  if (liveTileMetrics.nivcsw[idx] != null)
    s.nivcsw = liveTileMetrics.nivcsw[idx];
  if (liveTileMetrics.nvcsw[idx] != null) s.nvcsw = liveTileMetrics.nvcsw[idx];
  if (liveTileMetrics.in_backp[idx] != null)
    s.in_backp = liveTileMetrics.in_backp[idx];
  if (liveTileMetrics.backp_msgs[idx] != null)
    s.backp_msgs = liveTileMetrics.backp_msgs[idx];
  if (liveTileMetrics.last_cpu[idx] != null)
    s.last_cpu = liveTileMetrics.last_cpu[idx];
  if (liveTileMetrics.minflt[idx] != null)
    s.minflt = liveTileMetrics.minflt[idx];
  if (liveTileMetrics.majflt[idx] != null)
    s.majflt = liveTileMetrics.majflt[idx];
  if (liveTileMetrics.timers[idx] != null)
    s.timers = liveTileMetrics.timers[idx];
  if (liveTileMetrics.sched_timers[idx] != null)
    s.sched_timers = liveTileMetrics.sched_timers[idx];

  // Update previous delta values after commit (not during render)
  useEffect(() => {
    s.pNivcsw = nivcsw;
    s.pNvcsw = nvcsw;
    s.pBackp = backPressureCount;
  });

  if (alive === 2) return null;
  if (!rawTimers) return null;

  const t0 = rawTimers[0] === -1 ? 0 : rawTimers[0];
  const t1 = rawTimers[1] === -1 ? 0 : rawTimers[1];
  const t2 = rawTimers[2] === -1 ? 0 : rawTimers[2];
  const t3 = rawTimers[3] === -1 ? 0 : rawTimers[3];
  const t4 = rawTimers[4] === -1 ? 0 : rawTimers[4];
  const t5 = rawTimers[5] === -1 ? 0 : rawTimers[5];
  const t6 = rawTimers[6] === -1 ? 0 : rawTimers[6];
  const t7 = rawTimers[7] === -1 ? 0 : rawTimers[7];

  const hKeepPct = t0 + t1 + t2;
  const backpPct = t5;
  const waitPct = t6;
  const workPct = t3 + t4 + t7;

  const sW = rawSchedTimers
    ? rawSchedTimers[0] === -1
      ? 0
      : rawSchedTimers[0]
    : 0;
  const sI = rawSchedTimers
    ? rawSchedTimers[1] === -1
      ? 0
      : rawSchedTimers[1]
    : 0;
  const sU = rawSchedTimers
    ? rawSchedTimers[2] === -1
      ? 0
      : rawSchedTimers[2]
    : 0;
  const sS = rawSchedTimers
    ? rawSchedTimers[3] === -1
      ? 0
      : rawSchedTimers[3]
    : 0;

  return (
    <tr className={`rt-TableRow ${styles.row}`}>
      <td className={R}>
        {tile.kind}:{tile.kind_id}
      </td>
      <td className={R} align="right">
        {cpu}
      </td>
      <td
        className={alive ? `${R} ${styles.green}` : `${R} ${styles.red}`}
        align="right"
      >
        {alive ? "Live" : "Dead"}
      </td>
      <td className={R} align="right">
        {minflt}
      </td>
      <td className={R} align="right">
        {majflt}
      </td>
      <td className={R} align="right">
        {nivcsw != null ? numFmt.format(nivcsw) : "0"} |
        <span className={incrClass(nivcswDelta)}>
          +{numFmt.format(nivcswDelta)}
        </span>
      </td>
      <td className={R} align="right">
        {nvcsw != null ? numFmt.format(nvcsw) : "0"} |
        <span className={incrClass(nvcswDelta)}>
          +{numFmt.format(nvcswDelta)}
        </span>
      </td>
      <td className={inBackpressure ? `${R} ${styles.red}` : R}>
        {inBackpressure ? "Yes" : "-"}
      </td>
      <td className={R} align="right">
        {backPressureCount != null ? numFmt.format(backPressureCount) : "0"} |
        <span
          className={
            backpDelta
              ? `${styles.incrementText} ${styles.highIncrement}`
              : styles.incrementText
          }
        >
          +{numFmt.format(backpDelta)}
        </span>
      </td>
      <MUtilization idx={idx} />
      <td className={hKeepPct > 1 ? `${R} ${styles.red}` : R} align="right">
        {hKeepPct.toFixed(2)}%
      </td>
      <td className={R} align="right">
        {waitPct.toFixed(2)}%
      </td>
      <td className={backpPct > 0 ? `${R} ${styles.red}` : R} align="right">
        {backpPct.toFixed(2)}%
      </td>
      <td
        className={`${R} ${styles.pctGradient}`}
        align="right"
        style={{ "--pct": `${workPct}%` } as CSSProperties}
      >
        {workPct.toFixed(2)}%
      </td>
      <td className={R} align="right">
        {sW.toFixed(2)}%
      </td>
      <td className={R} align="right">
        {sU.toFixed(2)}%
      </td>
      <td className={R} align="right">
        {sS.toFixed(2)}%
      </td>
      <td className={R} align="right">
        {sI.toFixed(2)}%
      </td>
    </tr>
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
      <td className={`${R} ${styles.noPadding}`}>
        <Flex align="center">
          <Bars value={pct >= 0 ? pct : (prevPct ?? 0)} max={1} barWidth={2} />
        </Flex>
      </td>
      <td className={`${R} ${styles.noPadding}`}>
        <TileSparkLine
          value={avgValue}
          background={tileChartDarkBackground}
          windowMs={60_000}
          height={chartHeight}
          updateIntervalMs={updateIntervalMs}
          tickMs={1_000}
        />
      </td>
    </>
  );
});
