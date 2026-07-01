import { useAtomValue } from "jotai";
import {
  liveTileMetricsAtom,
  tilesAtom,
  tileTimerAtom,
  tileTimerHistoryAtom,
} from "../../../api/atoms";
import Card from "../../../components/Card";
import { Flex, Text } from "@radix-ui/themes";
import tableStyles from "../../Gossip/table.module.css";
import { numArrEqual } from "../../../utils";
import styles from "./liveTileMetrics.module.css";
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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
} from "react";
import { tileChartDarkBackground } from "../../../colors";
import TableDescriptionDialog from "./TableDescriptionDialog";
import { pinnedGroups, unpinnedGroups, type MetricGroup } from "./consts";

import { PriorityEnum } from "../../../api/entities";

const chartHeight = 18;

const priorityLabels: Record<Priority, string> = {
  floating: "Floating",
  startup: "Startup",
  normal: "Pinned",
  critical: "Critical",
};

interface TileRow {
  tile: Tile;
  idx: number;
}

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

function pinnedDataEqualityFn(a: PinnedRowData, b: PinnedRowData) {
  return (
    a.name === b.name && a.kindId === b.kindId && a.priority === b.priority
  );
}

function scrollableDataEqualityFn(a: ScrollableRowData, b: ScrollableRowData) {
  return (
    a.alive === b.alive &&
    a.inBackpressure === b.inBackpressure &&
    a.backPressureCount === b.backPressureCount &&
    a.cpu === b.cpu &&
    a.minflt === b.minflt &&
    a.majflt === b.majflt &&
    a.nivcsw === b.nivcsw &&
    a.nvcsw === b.nvcsw &&
    a.priority === b.priority &&
    numArrEqual(a.timers, b.timers) &&
    numArrEqual(a.schedTimers, b.schedTimers)
  );
}

function getRowKey({ tile }: TileRow) {
  return `${tile.kind}:${tile.kind_id}`;
}

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
  const tiles = useAtomValue(tilesAtom);
  const liveTileMetrics = useAtomValue(liveTileMetricsAtom);

  const prevPinnedDataRef = useRef<Map<number, PinnedRowData>>(new Map());
  const prevScrollableDataRef = useRef<Map<number, ScrollableRowData>>(
    new Map(),
  );
  const prevPinnedGroupHeaderDataRef = useRef<PriorityCountCellProps>({
    critical: 0,
    pinned: 0,
    floating: 0,
  });

  // Stable bit mask representation of alive tiles.
  // alive[i] is 2 if tile i has permanently shut down
  const aliveTiles = useMemo(
    () =>
      (liveTileMetrics?.alive ?? []).reduce<bigint>(
        (mask, v, i) => (v !== 2 ? mask | (1n << BigInt(i)) : mask),
        0n,
      ),
    [liveTileMetrics?.alive],
  );

  const rows = useMemo<TileRow[]>(
    () =>
      (tiles ?? [])
        .map((tile, idx) => ({ tile, idx }))
        .filter(({ idx }) => (aliveTiles >> BigInt(idx)) & 1n),
    [tiles, aliveTiles],
  );

  // Stablizes data reference per row when row priority hasn't changed
  const getPinnedData = useCallback(
    ({ tile, idx }: TileRow): PinnedRowData => {
      const prev = prevPinnedDataRef.current.get(idx);
      const next: PinnedRowData = {
        name: tile.kind,
        kindId: tile.kind_id,
        priority: liveTileMetrics?.priority?.[idx],
      };
      if (prev !== undefined && pinnedDataEqualityFn(prev, next)) return prev;
      prevPinnedDataRef.current.set(idx, next);
      return next;
    },
    [liveTileMetrics?.priority],
  );

  // Stablizes data reference per row when row data hasn't changed
  const getScrollableData = useCallback(
    ({ idx }: TileRow): ScrollableRowData => {
      const prev = prevScrollableDataRef.current.get(idx);
      const next: ScrollableRowData = {
        idx,
        alive: liveTileMetrics?.alive[idx] ?? prev?.alive,
        timers: liveTileMetrics?.timers[idx] ?? prev?.timers,
        schedTimers: liveTileMetrics?.sched_timers[idx] ?? prev?.schedTimers,
        inBackpressure: liveTileMetrics?.in_backp[idx] ?? prev?.inBackpressure,
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
      prevScrollableDataRef.current.set(idx, next);
      return next;
    },
    [liveTileMetrics],
  );

  // Stabalizes priority counts
  const pinnedGroupHeaderData = useMemo((): PriorityCountCellProps => {
    const priority = liveTileMetrics?.priority;
    const alive = liveTileMetrics?.alive;
    let critical = 0,
      pinned = 0,
      floating = 0;
    if (priority && alive) {
      for (let i = 0; i < priority.length; i++) {
        if (alive[i] === 2) continue;
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
    }

    const prev = prevPinnedGroupHeaderDataRef.current;
    if (
      prev.critical === critical &&
      prev.pinned === pinned &&
      prev.floating === floating
    )
      return prev;
    prevPinnedGroupHeaderDataRef.current = { critical, pinned, floating };
    return prevPinnedGroupHeaderDataRef.current;
  }, [liveTileMetrics?.priority, liveTileMetrics?.alive]);

  if (!tiles || !liveTileMetrics) return null;

  return (
    <Flex>
      <MInnerTable
        groups={pinnedGroups}
        rows={rows}
        getData={getPinnedData}
        RowRenderer={PinnedTileRow}
        groupHeaderData={pinnedGroupHeaderData}
        GroupHeaderRenderer={MPriorityCountCell}
        isPinned
      />
      <MInnerTable
        groups={unpinnedGroups}
        rows={rows}
        getData={getScrollableData}
        RowRenderer={ScrollableTileRow}
      />
    </Flex>
  );
}

interface InnerTableProps<TData, THeaderData> {
  groups: MetricGroup[];
  rows: TileRow[];
  getData: (row: TileRow) => TData;
  RowRenderer: ComponentType<{ data: TData }>;
  groupHeaderData?: THeaderData | null;
  GroupHeaderRenderer?: ComponentType<{ data: THeaderData }>;
  isPinned?: boolean;
}

function InnerTable<TData, THeaderData>({
  groups,
  rows,
  getData,
  RowRenderer,
  groupHeaderData,
  GroupHeaderRenderer,
  isPinned,
}: InnerTableProps<TData, THeaderData>) {
  const width = useMemo(
    () =>
      groups.reduce((acc, group) => {
        for (const metric of group.metrics) acc += metric.headerColWidth;
        return acc;
      }, 0),
    [groups],
  );

  const rootStyle = useMemo(
    () =>
      ({
        "--bar-height": `${chartHeight}px`,
        minWidth: isPinned ? width : 0,
        flexBasis: isPinned ? width : undefined,
        flexShrink: isPinned ? 0 : undefined,
        overflowX: isPinned ? undefined : "auto",
      }) as CSSProperties,
    [isPinned, width],
  );

  return (
    <div style={rootStyle} className={isPinned ? undefined : styles.scrollable}>
      <table className={clsx(tableStyles.root, styles.table)} style={{ width }}>
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
        <thead className={styles.header}>
          <tr>
            {groups.map((group, i) => (
              <th
                key={group.name}
                colSpan={group.metrics.length}
                className={clsx(styles.groupHeader, {
                  [styles.rightBorder]: isPinned || i !== groups.length - 1,
                })}
              >
                {GroupHeaderRenderer && groupHeaderData ? (
                  <MRenderer
                    Renderer={GroupHeaderRenderer}
                    data={groupHeaderData}
                  />
                ) : (
                  group.name
                )}
              </th>
            ))}
          </tr>
          <tr className={styles.lightBorderBottom}>
            {groups.map((group, i) =>
              group.metrics.map((metric, j) => (
                <th
                  key={metric.uniqueName}
                  align={metric.headerColAlign}
                  className={clsx({
                    [styles.wrap]: !!metric.wrap,
                    [styles.rightBorder]:
                      isPinned ||
                      // last metric (except in last group) has right border
                      (i !== groups.length - 1 &&
                        j === group.metrics.length - 1),
                  })}
                >
                  {metric.columnName ?? metric.uniqueName}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <MRenderer
              key={getRowKey(row)}
              data={getData(row)}
              Renderer={RowRenderer}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MInnerTable = memo(InnerTable) as typeof InnerTable;

function RenderData<TData>({
  data,
  Renderer,
}: {
  data: TData;
  Renderer: ComponentType<{ data: TData }>;
}) {
  return <Renderer data={data} />;
}
const MRenderer = memo(RenderData) as typeof RenderData;

function PinnedTileRow({ data }: { data: PinnedRowData }) {
  const isFloating = data.priority === PriorityEnum.floating;
  return (
    <tr className={clsx(styles.dataRow, { [styles.floating]: isFloating })}>
      <td className={styles.rightBorder}>
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
      className={clsx(styles.dataRow, {
        [styles.floating]: priority === PriorityEnum.floating,
      })}
    >
      <td align="right">{cpu}</td>
      <td
        className={clsx({ [styles.green]: alive, [styles.red]: !alive })}
        align="right"
      >
        {alive ? "Live" : "Dead"}
      </td>
      <td
        align="right"
        className={clsx({
          [styles.critical]: priority === PriorityEnum.critical,
        })}
      >
        {priority ? priorityLabels[priority] : "-"}
      </td>
      <td align="right" className={clsx({ [styles.red]: inBackpressure })}>
        {inBackpressure ? "Yes" : "-"}
      </td>
      <td align="right" className={styles.rightBorder}>
        {backPressureCount?.toLocaleString() ?? "-"} |
        <span
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
        </span>
      </td>

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
        className={clsx(styles.pctGradient, styles.rightBorder)}
        style={{ "--pct": `${workPct}%` } as CSSProperties}
      />

      <PctCell pct={schedWaitPct} />
      <PctCell pct={schedUserPct} />
      <PctCell pct={schedSystemPct} />
      <PctCell pct={schedIdlePct} className={styles.rightBorder} />

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
      className={clsx(styles.incrementText, {
        [styles.lowIncrement]: 1 <= value && value <= 10,
        [styles.midIncrement]: 11 <= value && value <= 100,
        [styles.highIncrement]: value >= 101,
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
      <td className={styles.noPadding}>
        <Flex align="center">
          <Bars value={pct >= 0 ? pct : (prevPct ?? 0)} max={1} barWidth={2} />
        </Flex>
      </td>
      <td className={clsx(styles.noPadding, styles.rightBorder)}>
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

interface PriorityCountCellProps {
  critical: number;
  pinned: number;
  floating: number;
}

const MPriorityCountCell = memo(function PriorityCountCell({
  data: { critical, pinned, floating },
}: {
  data: PriorityCountCellProps;
}) {
  return (
    <Flex className={styles.priorityCount} gap="5px" justify="between">
      <Text>
        {critical} <Text className={styles.critical}>C</Text>
      </Text>
      <Text>
        {pinned} <Text className={styles.pinned}>P</Text>
      </Text>
      <Text>
        {floating} <Text className={styles.floating}>F</Text>
      </Text>
    </Flex>
  );
});
