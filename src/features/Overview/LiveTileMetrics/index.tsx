import { useAtomValue } from "jotai";
import {
  liveTileMetricsAtom,
  tilesAtom,
  tileTimerAtom,
  tileTimerHistoryAtom,
} from "../../../api/atoms";
import Card from "../../../components/Card";
import { Flex, Table, Text } from "@radix-ui/themes";
import tableStyles from "./../../../components/dataTable.module.css";
import { Bars } from "../../StartupProgress/Firedancer/Bars";
import TileSparkLine from "../SlotPerformance/TileSparkLine";
import { headerGap } from "../../Gossip/consts";
import type { Priority, Tile, TileMetrics } from "../../../api/types";
import clsx from "clsx";
import {
  useHarmonicIntervalFn,
  usePrevious,
  usePreviousDistinct,
} from "react-use";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { tileChartDarkBackground } from "../../../colors";
import { isEqual } from "lodash";
import type { CellProps } from "@radix-ui/themes/components/table";
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import { metricGroups } from "./consts";
import { PriorityEnum } from "../../../api/entities";
import DataTable from "../../../components/DataTable";

const chartHeight = 18;

export default memo(function LiveTileMetrics() {
  return (
    <Card>
      <Flex direction="column" gap={headerGap} width="100%">
        <Flex align="center" gap="2">
          <Text className={tableStyles.headerText}>Tiles</Text>
          <TableDescriptionDialog groups={metricGroups} />
        </Flex>
        <DataTable
          groups={metricGroups}
          TableBody={LiveMetricsTableBody}
          style={
            {
              "--bar-height": `${chartHeight}px`,
            } as CSSProperties
          }
        />
      </Flex>
    </Card>
  );
});

interface LiveMetricsTableProps {
  isPinned?: boolean;
}
function LiveMetricsTableBody({ isPinned }: LiveMetricsTableProps) {
  const tiles = useAtomValue(tilesAtom);
  const liveTileMetrics = useAtomValue(liveTileMetricsAtom);

  if (!tiles || !liveTileMetrics) return null;

  return (
    <Table.Body>
      {tiles.map((tile, i) => (
        <TableRow
          key={`${tile.kind}${tile.kind_id}`}
          tile={tile}
          liveTileMetrics={liveTileMetrics}
          idx={i}
          isPinned={isPinned}
        />
      ))}
    </Table.Body>
  );
}

interface TableRowProps {
  tile: Tile;
  liveTileMetrics: TileMetrics;
  idx: number;
  isPinned?: boolean;
}
function TableRow({ tile, liveTileMetrics, idx, isPinned }: TableRowProps) {
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

  // Meaning tile has shut down, no need to list it in the table
  if (alive === 2) return;

  const timers =
    liveTileMetrics.timers[idx] || prevLiveTileMetricsIdx?.timers[idx];

  if (!timers) return;

  if (isPinned) {
    const isFloating =
      (liveTileMetrics.priority?.[idx] ??
        prevLiveTileMetricsIdx?.priority?.[idx]) === PriorityEnum.floating;
    return (
      <Table.Row
        className={clsx(tableStyles.dataRow, {
          [tableStyles.faded]: isFloating,
        })}
      >
        <Table.Cell className={tableStyles.rightBorder}>
          {tile.kind}:{tile.kind_id}
        </Table.Cell>
      </Table.Row>
    );
  }

  return (
    <DataRow
      alive={alive}
      timers={timers}
      liveTileMetrics={liveTileMetrics}
      prevLiveTileMetricsIdx={prevLiveTileMetricsIdx}
      idx={idx}
    />
  );
}

const priorityLabels: Record<Priority, string> = {
  floating: "Floating",
  startup: "Startup",
  normal: "Pinned",
  critical: "Critical",
};

interface DataRowProps {
  alive: number | null | undefined;
  timers: number[];
  liveTileMetrics: TileMetrics;
  prevLiveTileMetricsIdx?: TileMetrics;
  idx: number;
}
function DataRow({
  alive,
  timers,
  liveTileMetrics,
  prevLiveTileMetricsIdx,
  idx,
}: DataRowProps) {
  const prevSchedTimers = usePreviousDistinct(
    liveTileMetrics.sched_timers[idx],
  );
  const schedTimers =
    liveTileMetrics.sched_timers[idx] || prevSchedTimers || [];

  const [schedWaitPct, schedIdlePct, schedUserPct, schedSystemPct] =
    schedTimers.map((v) => (v === -1 ? 0 : v));

  const nivcsw =
    liveTileMetrics.nivcsw[idx] ?? prevLiveTileMetricsIdx?.nivcsw[idx];
  const nvcsw =
    liveTileMetrics.nvcsw[idx] ?? prevLiveTileMetricsIdx?.nvcsw[idx];
  const inBackpressure =
    liveTileMetrics.in_backp[idx] ?? prevLiveTileMetricsIdx?.in_backp[idx];
  const backPressureCount =
    liveTileMetrics.backp_msgs[idx] ?? prevLiveTileMetricsIdx?.backp_msgs[idx];
  const cpu =
    liveTileMetrics.last_cpu[idx] ?? prevLiveTileMetricsIdx?.last_cpu[idx];
  const minflt =
    liveTileMetrics.minflt[idx] ?? prevLiveTileMetricsIdx?.minflt[idx];
  const majflt =
    liveTileMetrics.majflt[idx] ?? prevLiveTileMetricsIdx?.majflt[idx];
  const priority =
    liveTileMetrics.priority?.[idx] ?? prevLiveTileMetricsIdx?.priority?.[idx];

  const prevNivcsw = usePrevious(nivcsw);
  const prevNvcsw = usePrevious(nvcsw);
  const prevBackPressureCount = usePrevious(backPressureCount);

  for (let i = 0; i < timers.length; i++) {
    if (timers[i] === -1) timers[i] = 0;
  }

  const hKeepPct = timers[0] + timers[1] + timers[2];
  const waitPct = timers[6];
  const backpPct = timers[5];
  const workPct = timers[3] + timers[4] + timers[7];

  return (
    <Table.Row
      className={clsx(tableStyles.dataRow, {
        [tableStyles.faded]: priority === PriorityEnum.floating,
      })}
    >
      <Table.Cell align="right">{cpu}</Table.Cell>
      <Table.Cell
        className={clsx({
          [tableStyles.green]: alive,
          [tableStyles.red]: !alive,
        })}
        align="right"
      >
        {alive ? "Live" : "Dead"}
      </Table.Cell>
      <Table.Cell
        align="right"
        className={clsx({
          [tableStyles.critical]: priority === PriorityEnum.critical,
        })}
      >
        {priority ? priorityLabels[priority] : "-"}
      </Table.Cell>
      <Table.Cell
        align="right"
        className={clsx({ [tableStyles.red]: inBackpressure })}
      >
        {inBackpressure ? "Yes" : "-"}
      </Table.Cell>
      <Table.Cell align="right" className={tableStyles.rightBorder}>
        {backPressureCount?.toLocaleString() ?? "-"} |
        <Text
          className={clsx(tableStyles.incrementText, {
            [tableStyles.highIncrement]:
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
        className={clsx({ [tableStyles.red]: hKeepPct > 1 })}
      />
      <PctCell pct={waitPct} />
      <PctCell
        pct={backpPct}
        className={clsx({ [tableStyles.red]: backpPct > 0 })}
      />
      <PctCell
        pct={workPct}
        className={clsx(tableStyles.pctGradient, tableStyles.rightBorder)}
        style={
          {
            "--pct": `${workPct}%`,
          } as CSSProperties
        }
      />

      <PctCell pct={schedWaitPct} />
      <PctCell pct={schedUserPct} />
      <PctCell pct={schedSystemPct} />
      <PctCell pct={schedIdlePct} className={tableStyles.rightBorder} />

      <Table.Cell align="right">{minflt?.toLocaleString() ?? "-"}</Table.Cell>
      <Table.Cell align="right">{majflt?.toLocaleString() ?? "-"}</Table.Cell>
      <Table.Cell align="right">
        {nivcsw?.toLocaleString() ?? "-"} |
        <IncrementText
          value={nivcsw != null && prevNivcsw != null ? nivcsw - prevNivcsw : 0}
        />
      </Table.Cell>
      <Table.Cell align="right">
        {nvcsw?.toLocaleString() ?? "-"} |
        <IncrementText
          value={nvcsw != null && prevNvcsw != null ? nvcsw - prevNvcsw : 0}
        />
      </Table.Cell>
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
      className={clsx(tableStyles.incrementText, {
        [tableStyles.lowIncrement]: 1 <= value && value <= 10,
        [tableStyles.midIncrement]: 11 <= value && value <= 100,
        [tableStyles.highIncrement]: value >= 101,
      })}
    >
      +{formatted}
    </Text>
  );
}

interface PctCellProps {
  pct: number | undefined;
}

function PctCell({ pct, ...props }: PctCellProps & CellProps) {
  return (
    <Table.Cell align="right" {...props}>
      {pct == null ? "--" : `${pct.toFixed(2)}%`}
    </Table.Cell>
  );
}

interface UtilizationProps {
  idx: number;
}

const updateIntervalMs = 300;

const MUtilization = memo(function Utilization({ idx }: UtilizationProps) {
  const tileTimers = useAtomValue(tileTimerAtom);
  const tileTimerHistory = useAtomValue(tileTimerHistoryAtom);
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

  const initialHistory = useMemo(
    () =>
      tileTimerHistory.history.map((h) => {
        const idle = h.values[idx] ?? 0;
        return {
          ts: h.ts,
          value: idle >= 0 ? 1 - Math.max(0, idle) : 0,
        };
      }),
    [tileTimerHistory.history, idx],
  );

  return (
    <>
      <Table.Cell className={tableStyles.noPadding}>
        <Flex align="center">
          <Bars value={pct >= 0 ? pct : (prevPct ?? 0)} max={1} barWidth={2} />
        </Flex>
      </Table.Cell>
      <Table.Cell
        className={clsx(tableStyles.noPadding, tableStyles.rightBorder)}
      >
        <TileSparkLine
          value={avgValue}
          history={initialHistory}
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
