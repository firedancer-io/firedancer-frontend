import type { MutableRefObject } from "react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  latestTurbineSlotColor,
  firstTurbineSlotColor,
  replayedSlotColor,
  needsReplaySlotColor,
  missingSlotColor,
  repairedNeedsReplaySlotColor,
} from "../../../colors";
import UplotReact from "../../../uplotReact/UplotReact";
import { getDefaultStore, useAtomValue } from "jotai";
import {
  catchingUpDataAtom,
  turbineBarIndicesAtom,
  type CatchingUpData,
} from "../atoms";
import styles from "./catchingUp.module.css";
import { useValuePerSecond } from "./useValuePerSecond";
import { useInterval } from "react-use";

const store = getDefaultStore();

export const barWidthPx = 4;
const gapRelativeWidth = 1;
export const gapWidthPx = barWidthPx * gapRelativeWidth;
const radius = Math.trunc(barWidthPx / 2);

const emptyChartData: uPlot.AlignedData = [[0], [null]];

export function SlotBars() {
  const data = useAtomValue(catchingUpDataAtom);

  const dataRef = useRef<CatchingUpData | undefined>(data);

  const [drewCompleted, setDrewCompleted] = useState(false);
  const uplotRef = useRef<uPlot>();

  const intervalRef = useRef<NodeJS.Timeout>();
  const estimatedTotalSlotsRef = useEstimatedTotalSlots();

  dataRef.current = data;

  // redraw at interval
  useEffect(() => {
    if (!dataRef.current) return;

    if (drewCompleted) {
      clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      if (!uplotRef.current || drewCompleted || !dataRef.current) return;
      if (
        dataRef.current.latestReplaySlot === dataRef.current.latestTurbineSlot
      ) {
        setDrewCompleted(true);
      }
      uplotRef.current.redraw();
    }, 10);

    return () => clearInterval(intervalRef.current);
  }, [dataRef, drewCompleted]);

  const options = useMemo<uPlot.Options>(() => {
    return {
      pxAlign: 0,
      width: 0,
      height: 0,
      scales: { x: { time: false } },
      axes: [{ show: false }, { show: false }],
      series: [{}, { points: { show: false } }],
      plugins: [catchingUpBarsPlugin(estimatedTotalSlotsRef, dataRef)],
      legend: { show: false },
    };
  }, [dataRef, estimatedTotalSlotsRef]);

  const handleCreate = useCallback((u: uPlot) => {
    uplotRef.current = u;
  }, []);

  return (
    <div className={styles.barsContainer}>
      <AutoSizer>
        {({ height, width }) => {
          options.width = width;
          options.height = height;

          return (
            <>
              <UplotReact
                id="catching-up-slot-bars"
                options={options}
                data={emptyChartData}
                onCreate={handleCreate}
              />
            </>
          );
        }}
      </AutoSizer>
    </div>
  );
}

function catchingUpBarsPlugin(
  estimatedTotalSlotsRef: MutableRefObject<number | undefined>,
  dataRef: MutableRefObject<CatchingUpData | undefined>,
): uPlot.Plugin {
  return {
    hooks: {
      drawSeries: [
        (u) => {
          if (estimatedTotalSlotsRef.current == null || !dataRef.current)
            return;

          const ctx = u.ctx;
          ctx.save();

          const y = u.bbox.top;
          const height = u.bbox.height;

          const barWidth = barWidthPx * window.devicePixelRatio;
          const gapWidth = gapWidthPx * window.devicePixelRatio;

          const totalBarsForRow = Math.trunc(
            (u.bbox.width + gapWidth) / (barWidth + gapWidth),
          );

          const {
            startSlot,
            repairSlots,
            latestReplaySlot,
            firstTurbineSlot,
            latestTurbineSlot,
            turbineSlots,
          } = dataRef.current;

          const currentSlotsCount = latestTurbineSlot - startSlot + 1;
          const isComplete = latestReplaySlot === latestTurbineSlot;

          const totalSlotsCount = isComplete
            ? currentSlotsCount
            : Math.max(currentSlotsCount, estimatedTotalSlotsRef.current);

          const slotsPerBar = totalSlotsCount / totalBarsForRow;

          const getMaxBarIndexForSlot = (slot: number) => {
            if (!slotsPerBar) return 0;
            const barCount = Math.ceil((slot - startSlot + 1) / slotsPerBar);
            return Math.min(barCount - 1, totalBarsForRow - 1);
          };

          const latestTurbineBarIndex =
            getMaxBarIndexForSlot(latestTurbineSlot);
          const firstTurbineBarIndex = getMaxBarIndexForSlot(firstTurbineSlot);

          store.set(turbineBarIndicesAtom, {
            first: firstTurbineBarIndex,
            latest: latestTurbineBarIndex,
          });

          for (let barIndex = 0; barIndex < totalBarsForRow; barIndex++) {
            const prevSlots = barIndex * slotsPerBar;
            const firstSlotInBar = startSlot + Math.trunc(prevSlots);

            if (firstSlotInBar > latestTurbineSlot) break;

            const prevSlotsIncludingBar = (barIndex + 1) * slotsPerBar;
            const lastSlotInBar = Math.min(
              latestTurbineSlot,
              startSlot + Math.ceil(prevSlotsIncludingBar) - 1,
            );

            const x = barIndex * (barWidth + gapWidth);

            const getBarColor = (
              firstSlot: number,
              lastSlot: number,
              barIndex: number,
            ) => {
              if (barIndex === latestTurbineBarIndex)
                return latestTurbineSlotColor;
              if (barIndex === firstTurbineBarIndex)
                return firstTurbineSlotColor;

              const slots = Array.from(
                { length: lastSlot - firstSlot + 1 },
                (_, i) => firstSlot + i,
              );

              if (
                slots.some(
                  (s) =>
                    s > latestReplaySlot &&
                    !repairSlots.has(s) &&
                    (s < firstTurbineSlot || !turbineSlots.has(s)),
                )
              )
                return missingSlotColor;

              if (
                slots.some((s) => s > latestReplaySlot && repairSlots.has(s))
              ) {
                return repairedNeedsReplaySlotColor;
              }

              if (
                slots.some((s) => s > latestReplaySlot && turbineSlots.has(s))
              ) {
                return needsReplaySlotColor;
              }

              return replayedSlotColor;
            };

            ctx.fillStyle = getBarColor(
              firstSlotInBar,
              lastSlotInBar,
              barIndex,
            );

            // draw corners clockwise, starting with top left
            ctx.beginPath();
            ctx.arc(x + radius, y + radius, radius, Math.PI, 1.5 * Math.PI);
            ctx.arc(
              x + barWidth - radius,
              y + radius,
              radius,
              1.5 * Math.PI,
              0,
            );
            ctx.arc(
              x + barWidth - radius,
              y + height - radius,
              radius,
              0,
              0.5 * Math.PI,
            );
            ctx.arc(
              x + radius,
              y + height - radius,
              radius,
              0.5 * Math.PI,
              Math.PI,
            );
            ctx.closePath();
            ctx.fill();
          }

          ctx.restore();
        },
      ],
    },
  };
}

const rateCalcWindowMs = 10_000;
function useEstimatedTotalSlots() {
  const estimatedTotalSlotsRef = useRef<number>();

  const data = useAtomValue(catchingUpDataAtom);
  const { valuePerSecond: replayRate } = useValuePerSecond(
    data?.latestReplaySlot,
    rateCalcWindowMs,
  );
  const { valuePerSecond: turbineRate } = useValuePerSecond(
    data?.latestTurbineSlot,
    rateCalcWindowMs,
  );

  // initial estimate of how many slots to show when catching up is completed
  useEffect(() => {
    // already have an initial estimate
    if (!data || estimatedTotalSlotsRef.current != null) return;

    estimatedTotalSlotsRef.current = getTotalSlots(
      400,
      100,
      data.startSlot,
      data.latestReplaySlot,
      data.latestTurbineSlot,
    );
  }, [data, estimatedTotalSlotsRef]);

  // update estimate
  useInterval(() => {
    const prevEstimate = estimatedTotalSlotsRef.current;
    if (!data || replayRate == null || turbineRate == null || !prevEstimate)
      return;

    const newEstimate = getTotalSlots(
      replayRate,
      turbineRate,
      data.startSlot,
      data.latestReplaySlot,
      data.latestTurbineSlot,
    );

    if (!newEstimate) return;

    // only reduce estimate, to prevent the drawn bars from being compressed to the left
    if (newEstimate >= prevEstimate) return;

    // apply incremental change
    const diffToApply = Math.min(
      0.15 * prevEstimate,
      prevEstimate - newEstimate,
    );

    estimatedTotalSlotsRef.current = prevEstimate - diffToApply;
  }, 500);

  return estimatedTotalSlotsRef;
}

function getTotalSlots(
  replayRate: number,
  turbineRate: number,
  startSlot: number,
  latestReplaySlot: number,
  latestTurbineSlot: number,
) {
  if (latestReplaySlot === latestTurbineSlot)
    return latestTurbineSlot - startSlot;

  if (replayRate <= turbineRate) return;

  const projectedSlotsToReplay =
    (replayRate * (latestTurbineSlot - latestReplaySlot)) /
    (replayRate - turbineRate);
  const replayedSlots = latestReplaySlot - startSlot;
  return replayedSlots + projectedSlotsToReplay;
}
