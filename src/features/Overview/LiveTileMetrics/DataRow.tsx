import { getDefaultStore, useAtomValue } from "jotai";
import { liveTileMetricsAtom, tileTimerHistoryAtom } from "../../../api/atoms";
import {
  liveTileRowAtomFamily,
  tileTimerValueAtomFamily,
  type TileRowMetrics,
} from "./atoms";
import { Flex, Table, Text } from "@radix-ui/themes";
import styles from "./liveTileMetrics.module.css";
import { Bars } from "../../StartupProgress/Firedancer/Bars";
import TileSparkLine from "../SlotPerformance/TileSparkLine";
import type { Priority } from "../../../api/types";
import clsx from "clsx";
import { clamp } from "lodash";
import { useHarmonicIntervalFn } from "react-use";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { tileChartDarkBackground } from "../../../colors";
import type { CellProps } from "@radix-ui/themes/components/table";
import { chartHeight } from "./consts";
import { PriorityEnum } from "../../../api/entities";

const store = getDefaultStore();

/**
 * Each component subscribes to the relevant state in the Jotai store.
 * This allows for fine-grained updates without re-rendering through react.
 */

type CellWrite<E extends HTMLElement> = (
  el: E,
  cur: TileRowMetrics | undefined,
  prev: TileRowMetrics | undefined,
) => void;

function useStateCell<E extends HTMLElement>(
  idx: number,
  ref: { current: E | null },
  write: CellWrite<E>,
) {
  useLayoutEffect(() => {
    const rowAtom = liveTileRowAtomFamily(idx);
    let prev = store.get(rowAtom);

    const handleUpdate = () => {
      const cur = store.get(rowAtom);
      if (ref.current) write(ref.current, cur, prev);
      prev = cur;
    };

    const unsub = store.sub(rowAtom, handleUpdate);
    handleUpdate();
    return unsub;
  }, [idx, ref, write]);
}

interface LiveCellProps {
  idx: number;
  write: CellWrite<HTMLTableCellElement>;
}

function LiveCell({ idx, write, ...cellProps }: LiveCellProps & CellProps) {
  const ref = useRef<HTMLTableCellElement>(null);
  useStateCell(idx, ref, write);
  return <Table.Cell ref={ref} {...cellProps} />;
}

const pctText = (pct: number | undefined) =>
  pct == null ? "--" : `${pct.toFixed(2)}%`;

// -1 is a "no data" sentinel; normalize to 0.
const normTimers = (cur?: TileRowMetrics, prev?: TileRowMetrics) =>
  (cur?.timers || prev?.timers || []).map((v) => (v === -1 ? 0 : v));

const priorityLabels: Record<Priority, string> = {
  floating: "Floating",
  startup: "Startup",
  normal: "Pinned",
  critical: "Critical",
};

const writeCpu: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  el.textContent = `${c?.last_cpu ?? p?.last_cpu ?? ""}`;
};

const writeAlive: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  const alive = c?.alive ?? p?.alive;
  el.textContent = alive ? "Live" : "Dead";
  el.classList.toggle(styles.green, !!alive);
  el.classList.toggle(styles.red, !alive);
};

const writePriority: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  const priority = c?.priority ?? p?.priority;
  el.textContent = priority ? priorityLabels[priority] : "-";
  el.classList.toggle(styles.critical, priority === PriorityEnum.critical);
};

const writeInBackp: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  const inBackp = c?.in_backp ?? p?.in_backp;
  el.textContent = inBackp ? "Yes" : "-";
  el.classList.toggle(styles.red, !!inBackp);
};

const writeHKeep: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  const t = normTimers(c, p);
  const v = t[0] + t[1] + t[2];
  el.textContent = pctText(v);
  el.classList.toggle(styles.red, v > 1);
};

const writeWait: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  el.textContent = pctText(normTimers(c, p)[6]);
};

const writeBackpPct: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  const v = normTimers(c, p)[5];
  el.textContent = pctText(v);
  el.classList.toggle(styles.red, v > 0);
};

const writeWork: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  const t = normTimers(c, p);
  const v = t[3] + t[4] + t[7];
  el.textContent = pctText(v);
  el.style.setProperty("--pct", `${v}%`);
};

const writeMinflt: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  el.textContent = (c?.minflt ?? p?.minflt)?.toLocaleString() ?? "-";
};

const writeMajflt: CellWrite<HTMLTableCellElement> = (el, c, p) => {
  el.textContent = (c?.majflt ?? p?.majflt)?.toLocaleString() ?? "-";
};

// alive === 2 (shutdown) or no timers -> row hidden.
const writeRow: CellWrite<HTMLTableRowElement> = (el, c, p) => {
  const alive = c?.alive ?? p?.alive;
  const hasTimers = !!(c?.timers || p?.timers);
  const priority = c?.priority ?? p?.priority;
  el.style.display = alive === 2 || !hasTimers ? "none" : "";
  el.classList.toggle(styles.floating, priority === PriorityEnum.floating);
};

type RowPick = (row: TileRowMetrics | undefined) => number | null | undefined;
const pickBackp: RowPick = (r) => r?.backp_msgs;
const pickNivcsw: RowPick = (r) => r?.nivcsw;
const pickNvcsw: RowPick = (r) => r?.nvcsw;
const pickIrq: RowPick = (r) => r?.interrupts;

function writeIncrement(el: HTMLElement, value: number, graded: boolean) {
  el.textContent = `+${value.toLocaleString()}`;
  if (graded) {
    el.classList.toggle(styles.lowIncrement, 1 <= value && value <= 10);
    el.classList.toggle(styles.midIncrement, 11 <= value && value <= 100);
    el.classList.toggle(styles.highIncrement, value >= 101);
  } else {
    el.classList.toggle(styles.highIncrement, !!value);
  }
}

interface LiveCountIncrementProps {
  idx: number;
  pick: RowPick;
  graded?: boolean;
  blankOnFloating?: boolean;
}

function LiveCountIncrement({
  idx,
  pick,
  graded = false,
  blankOnFloating = false,
  ...cellProps
}: LiveCountIncrementProps & CellProps) {
  const countRef = useRef<HTMLSpanElement>(null);
  const incRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const rowAtom = liveTileRowAtomFamily(idx);
    let lastKnown: number | null | undefined;
    let prevTick: number | null | undefined;

    const handleUpdate = () => {
      const rowData = store.get(rowAtom);

      if (blankOnFloating) {
        if (rowData?.priority === PriorityEnum.floating) {
          if (countRef.current) {
            countRef.current.textContent = "--";
          }
          if (incRef.current) {
            incRef.current.classList.add(styles.hidden);
          }
          prevTick = undefined;
          lastKnown = undefined;
          return;
        }

        if (incRef.current) {
          incRef.current.classList.remove(styles.hidden);
        }
      }

      const value = pick(rowData);
      const resolved = value ?? lastKnown;
      const inc =
        resolved != null && prevTick != null ? resolved - prevTick : 0;

      prevTick = resolved;
      if (value != null) {
        lastKnown = value;
      }

      if (countRef.current) {
        countRef.current.textContent = `${resolved?.toLocaleString() ?? "-"} |`;
      }
      if (incRef.current) {
        writeIncrement(incRef.current, inc, graded);
      }
    };

    // Heartbeat (fires every tick) so a flat counter resets the delta to +0.
    const unsub = store.sub(liveTileMetricsAtom, handleUpdate);
    handleUpdate();
    return unsub;
  }, [idx, pick, graded, blankOnFloating]);

  return (
    <Table.Cell {...cellProps}>
      <span ref={countRef} />
      <Text ref={incRef} className={styles.incrementText} />
    </Table.Cell>
  );
}

// The four scheduler cells share one array and a sticky last-non-null fallback.
function LiveSchedCells({ idx }: { idx: number }) {
  const waitRef = useRef<HTMLTableCellElement>(null);
  const userRef = useRef<HTMLTableCellElement>(null);
  const systemRef = useRef<HTMLTableCellElement>(null);
  const idleRef = useRef<HTMLTableCellElement>(null);

  useLayoutEffect(() => {
    const rowAtom = liveTileRowAtomFamily(idx);
    let sticky: number[] | null | undefined;

    const handleUpdate = () => {
      const cur = store.get(rowAtom);
      const sched = cur?.sched_timers || sticky || [];
      const t = sched.map((v) => (v === -1 ? 0 : v));

      if (waitRef.current) waitRef.current.textContent = pctText(t[0]);
      if (userRef.current) userRef.current.textContent = pctText(t[2]);
      if (systemRef.current) systemRef.current.textContent = pctText(t[3]);
      if (idleRef.current) idleRef.current.textContent = pctText(t[1]);
      if (cur?.sched_timers) sticky = cur.sched_timers;
    };

    const unsub = store.sub(rowAtom, handleUpdate);
    handleUpdate();
    return unsub;
  }, [idx]);

  return (
    <>
      <Table.Cell ref={waitRef} align="right" />
      <Table.Cell ref={userRef} align="right" />
      <Table.Cell ref={systemRef} align="right" />
      <Table.Cell ref={idleRef} align="right" className={styles.rightBorder} />
    </>
  );
}

interface UtilizationProps {
  idx: number;
}

const updateIntervalMs = 300;

const timerToPct = (tileTimer: number | null | undefined) =>
  tileTimer != null && tileTimer >= 0 ? 1 - Math.max(0, tileTimer) : -1;

const barsPct = (value: number) => (!value ? 0 : clamp(value, 0, 1));

const MUtilization = memo(function Utilization({ idx }: UtilizationProps) {
  const tileTimerHistory = useAtomValue(tileTimerHistoryAtom);

  const initialTimer = store.get(tileTimerValueAtomFamily(idx));
  const initialPct = timerToPct(initialTimer);

  const prevPctRef = useRef<number | undefined>(
    initialPct >= 0 ? initialPct : undefined,
  );
  const barsWrapRef = useRef<HTMLDivElement>(null);

  const rollingSum = useRef({ count: 0, sum: 0 });
  const [avgValue, setAvgValue] = useState(initialPct);

  useEffect(() => {
    const writeBar = () => {
      const tileTimer = store.get(tileTimerValueAtomFamily(idx));
      const pct = timerToPct(tileTimer);

      const value = pct >= 0 ? pct : (prevPctRef.current ?? 0);
      const barEl = barsWrapRef.current?.firstElementChild as HTMLElement;

      if (barEl) barEl.style.setProperty("--pct", `${barsPct(value)}`);

      if (pct >= 0 && pct !== prevPctRef.current) prevPctRef.current = pct;

      if (pct >= 0) {
        rollingSum.current.count++;
        rollingSum.current.sum += pct;
      }
    };

    const unsub = store.sub(tileTimerValueAtomFamily(idx), writeBar);
    writeBar();
    return unsub;
  }, [idx]);

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
      <Table.Cell className={styles.noPadding}>
        <Flex align="center" ref={barsWrapRef}>
          <Bars
            value={initialPct >= 0 ? initialPct : (prevPctRef.current ?? 0)}
            max={1}
            barWidth={2}
          />
        </Flex>
      </Table.Cell>
      <Table.Cell className={clsx(styles.noPadding, styles.rightBorder)}>
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

interface DataRowProps {
  idx: number;
}

export const DataRow = memo(function DataRow({ idx }: DataRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  useStateCell(idx, rowRef, writeRow);

  return (
    <Table.Row ref={rowRef} className={styles.dataRow}>
      <LiveCell idx={idx} write={writeCpu} align="right" />
      <LiveCell idx={idx} write={writeAlive} align="right" />
      <LiveCell idx={idx} write={writePriority} align="right" />
      <LiveCell idx={idx} write={writeInBackp} align="right" />
      <LiveCountIncrement
        idx={idx}
        pick={pickBackp}
        align="right"
        className={styles.rightBorder}
      />

      <MUtilization idx={idx} />

      <LiveCell idx={idx} write={writeHKeep} align="right" />
      <LiveCell idx={idx} write={writeWait} align="right" />
      <LiveCell idx={idx} write={writeBackpPct} align="right" />
      <LiveCell
        idx={idx}
        write={writeWork}
        align="right"
        className={clsx(styles.pctGradient, styles.rightBorder)}
      />

      <LiveSchedCells idx={idx} />

      <LiveCell idx={idx} write={writeMinflt} align="right" />
      <LiveCell idx={idx} write={writeMajflt} align="right" />
      <LiveCountIncrement idx={idx} pick={pickNivcsw} graded align="right" />
      <LiveCountIncrement idx={idx} pick={pickNvcsw} graded align="right" />
      <LiveCountIncrement
        idx={idx}
        pick={pickIrq}
        graded
        blankOnFloating
        align="right"
      />
    </Table.Row>
  );
});
