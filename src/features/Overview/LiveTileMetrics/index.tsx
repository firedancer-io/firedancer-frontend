import { useAtomValue } from "jotai";
import {
  liveTileMetricsAtom,
  tilesAtom,
  tileTimerAtom,
  tileTimerHistoryAtom,
} from "../../../api/atoms";
import Card from "../../../components/Card";
import { Flex, Text } from "@radix-ui/themes";
import tableStyles from "./../../../components/dataTable.module.css";
import { Bars } from "../../StartupProgress/Firedancer/Bars";
import TileSparkLine from "../SlotPerformance/TileSparkLine";
import { headerGap } from "../../Gossip/consts";
import type { Priority, Tile } from "../../../api/types";
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
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import { metricGroups } from "./consts";
import { PriorityEnum } from "../../../api/entities";
import DataTable from "../../../components/DataTable";

const chartHeight = 18;
const tableStyle = { "--bar-height": `${chartHeight}px` } as CSSProperties;

const priorityLabels: Record<Priority, string> = {
  floating: "Floating",
  startup: "Startup",
  normal: "Pinned",
  critical: "Critical",
};

interface PinnedRowData {
  name: string;
  kindId: number;
  priority: Priority | undefined;
}

interface ScrollableRowData {
  idx: number;
  alive: number | null | undefined;
  timers: number[] | null | undefined;
  schedTimers: number[] | null | undefined;
  inBackpressure: boolean | null | undefined;
  backPressureCount: number | null | undefined;
  cpu: number | null | undefined;
  minflt: number | null | undefined;
  majflt: number | null | undefined;
  nivcsw: number | null | undefined;
  nvcsw: number | null | undefined;
  priority: Priority | undefined;
}

interface TileRow {
  tile: Tile;
  idx: number;
}

function pinnedDataEqualityFn(a: PinnedRowData, b: PinnedRowData) {
  return (
    a.name === b.name && a.kindId === b.kindId && a.priority === b.priority
  );
}

function scrollableDataEqualityFn(a: ScrollableRowData, b: ScrollableRowData) {
  if (
    a.alive !== b.alive ||
    a.inBackpressure !== b.inBackpressure ||
    a.backPressureCount !== b.backPressureCount ||
    a.cpu !== b.cpu ||
    a.minflt !== b.minflt ||
    a.majflt !== b.majflt ||
    a.nivcsw !== b.nivcsw ||
    a.nvcsw !== b.nvcsw ||
    a.priority !== b.priority
  )
    return false;

  const at = a.timers;
  const bt = b.timers;
  if (at !== bt) {
    if (!at || !bt || at.length !== bt.length) return false;
    for (let i = 0; i < at.length; i++) if (at[i] !== bt[i]) return false;
  }

  const ast = a.schedTimers;
  const bst = b.schedTimers;
  if (ast !== bst) {
    if (!ast || !bst || ast.length !== bst.length) return false;
    for (let i = 0; i < ast.length; i++) if (ast[i] !== bst[i]) return false;
  }

  return true;
}

function getRowKey({ tile }: TileRow) {
  return `${tile.kind}:${tile.kind_id}`;
}

export default memo(function LiveTileMetrics() {
  const tiles = useAtomValue(tilesAtom);
  const liveTileMetrics = useAtomValue(liveTileMetricsAtom);

  const rows = useMemo<TileRow[]>(
    () =>
      (tiles ?? [])
        .map((tile, idx) => ({ tile, idx }))
        .filter(({ idx }) => liveTileMetrics?.alive[idx] !== 2),
    [tiles, liveTileMetrics?.alive],
  );

  const getPinnedData = useMemo(
    () =>
      ({ tile, idx }: TileRow): PinnedRowData => ({
        name: tile.kind,
        kindId: tile.kind_id,
        priority: liveTileMetrics?.priority?.[idx],
      }),
    [liveTileMetrics?.priority],
  );

  const prevScrollableRef = useRef<Map<number, ScrollableRowData>>(new Map());

  // Returns a stable object reference per tile when data hasn't changed for that row
  const getScrollableData = useMemo(
    () =>
      ({ tile: _tile, idx }: TileRow): ScrollableRowData => {
        const prev = prevScrollableRef.current.get(idx);
        const next: ScrollableRowData = {
          idx,
          alive: liveTileMetrics?.alive[idx] ?? prev?.alive,
          timers: liveTileMetrics?.timers[idx] ?? prev?.timers,
          schedTimers: liveTileMetrics?.sched_timers[idx] ?? prev?.schedTimers,
          inBackpressure:
            liveTileMetrics?.in_backp[idx] ?? prev?.inBackpressure,
          backPressureCount:
            liveTileMetrics?.backp_msgs[idx] ?? prev?.backPressureCount,
          cpu: liveTileMetrics?.last_cpu[idx] ?? prev?.cpu,
          minflt: liveTileMetrics?.minflt[idx] ?? prev?.minflt,
          majflt: liveTileMetrics?.majflt[idx] ?? prev?.majflt,
          nivcsw: liveTileMetrics?.nivcsw[idx] ?? prev?.nivcsw,
          nvcsw: liveTileMetrics?.nvcsw[idx] ?? prev?.nvcsw,
          priority: liveTileMetrics?.priority?.[idx] ?? prev?.priority,
        };
        if (prev !== undefined && scrollableDataEqualityFn(prev, next))
          return prev;
        prevScrollableRef.current.set(idx, next);
        return next;
      },
    [liveTileMetrics],
  );

  if (!tiles) return null;

  return (
    <Card>
      <Flex direction="column" gap={headerGap} width="100%">
        <Flex align="center" gap="2">
          <Text className={tableStyles.headerText}>Tiles</Text>
          <TableDescriptionDialog groups={metricGroups} />
        </Flex>
        <DataTable
          groups={metricGroups}
          rows={rows}
          getRowKey={getRowKey}
          getPinnedData={getPinnedData}
          getScrollableData={getScrollableData}
          PinnedRow={PinnedTileRow}
          ScrollableRow={ScrollableTileRow}
          pinnedDataEqualityFn={pinnedDataEqualityFn}
          style={tableStyle}
        />
      </Flex>
    </Card>
  );
});

function PinnedTileRow({ data }: { data: PinnedRowData }) {
  const isFloating = data.priority === PriorityEnum.floating;
  return (
    <tr
      className={clsx(tableStyles.dataRow, {
        [tableStyles.faded]: isFloating,
      })}
    >
      <td className={tableStyles.rightBorder}>
        {data.name}:{data.kindId}
      </td>
    </tr>
  );
}

function ScrollableTileRow({ data }: { data: ScrollableRowData }) {
  const {
    alive,
    timers,
    idx,
    inBackpressure,
    backPressureCount,
    cpu,
    minflt,
    majflt,
    nivcsw,
    nvcsw,
    schedTimers,
    priority,
  } = data;

  const prevNivcsw = usePrevious(nivcsw);
  const prevNvcsw = usePrevious(nvcsw);
  const prevBackPressureCount = usePrevious(backPressureCount);

  if (!timers) return <tr />;

  const [schedWaitPct, schedIdlePct, schedUserPct, schedSystemPct] = (
    schedTimers ?? []
  ).map((v) => (v === -1 ? 0 : v));

  const t = timers.map((v) => (v === -1 ? 0 : v));
  const hKeepPct = t[0] + t[1] + t[2];
  const waitPct = t[6];
  const backpPct = t[5];
  const workPct = t[3] + t[4] + t[7];

  return (
    <tr
      className={clsx(tableStyles.dataRow, {
        [tableStyles.faded]: priority === PriorityEnum.floating,
      })}
    >
      <td align="right">{cpu}</td>
      <td
        className={clsx({
          [tableStyles.green]: alive,
          [tableStyles.red]: !alive,
        })}
        align="right"
      >
        {alive ? "Live" : "Dead"}
      </td>
      <td
        align="right"
        className={clsx({
          [tableStyles.critical]: priority === PriorityEnum.critical,
        })}
      >
        {priority ? priorityLabels[priority] : "-"}
      </td>
      <td align="right" className={clsx({ [tableStyles.red]: inBackpressure })}>
        {inBackpressure ? "Yes" : "-"}
      </td>
      <td align="right" className={tableStyles.rightBorder}>
        {backPressureCount?.toLocaleString() ?? "-"} |
        <span
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
        </span>
      </td>

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

      <td align="right">{minflt?.toLocaleString() ?? "-"}</td>
      <td align="right">{majflt?.toLocaleString() ?? "-"}</td>
      <td align="right">
        {nivcsw?.toLocaleString() ?? "-"} |
        <IncrementText
          value={nivcsw != null && prevNivcsw != null ? nivcsw - prevNivcsw : 0}
        />
      </td>
      <td align="right">
        {nvcsw?.toLocaleString() ?? "-"} |
        <IncrementText
          value={nvcsw != null && prevNvcsw != null ? nvcsw - prevNvcsw : 0}
        />
      </td>
    </tr>
  );
}

interface IncrementTextProps {
  value: number;
}
function IncrementText({ value }: IncrementTextProps) {
  const formatted = value.toLocaleString();
  return (
    <span
      className={clsx(tableStyles.incrementText, {
        [tableStyles.lowIncrement]: 1 <= value && value <= 10,
        [tableStyles.midIncrement]: 11 <= value && value <= 100,
        [tableStyles.highIncrement]: value >= 101,
      })}
    >
      +{formatted}
    </span>
  );
}

interface PctCellProps {
  pct: number | undefined;
  className?: string;
  style?: CSSProperties;
}

function PctCell({ pct, className, style }: PctCellProps) {
  return (
    <td className={className} style={style} align="right">
      {pct == null ? "--" : `${pct.toFixed(2)}%`}
    </td>
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
      <td className={tableStyles.noPadding}>
        <Flex align="center">
          <Bars value={pct >= 0 ? pct : (prevPct ?? 0)} max={1} barWidth={2} />
        </Flex>
      </td>
      <td className={clsx(tableStyles.noPadding, tableStyles.rightBorder)}>
        <TileSparkLine
          value={avgValue}
          history={initialHistory}
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
