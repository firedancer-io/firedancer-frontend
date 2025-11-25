import type { MutableRefObject } from "react";
import { getDefaultStore } from "jotai";

import { catchingUpContainerElAtom, type CatchingUpData } from "./atoms";
import { getBarColor, getMaxBarIndexForSlot } from "./utils";

const store = getDefaultStore();

const barWidthPx = 4;
const gapWidthPx = barWidthPx;

export function catchingUpBarsPlugin(
  catchingUpRatesRef: React.MutableRefObject<{
    totalSlotsEstimate?: number;
    replaySlotsPerSecond?: number;
    turbineSlotsPerSecond?: number;
  }>,
  dataRef: MutableRefObject<CatchingUpData | undefined>,
): uPlot.Plugin {
  return {
    hooks: {
      drawSeries: [
        (u) => {
          const totalSlotsEstimate =
            catchingUpRatesRef.current.totalSlotsEstimate;
          if (totalSlotsEstimate == null || !dataRef.current) {
            return;
          }

          const ctx = u.ctx;
          ctx.save();

          const y = u.bbox.top;
          const height = u.bbox.height;

          const barWidth = barWidthPx * window.devicePixelRatio;
          const gapWidth = gapWidthPx * window.devicePixelRatio;
          const radius = barWidth / 2;

          const totalBarsThatFit = Math.trunc(
            (u.bbox.width + gapWidth) / (barWidth + gapWidth),
          );

          const slotsPerBar = totalSlotsEstimate / totalBarsThatFit;

          const {
            startSlot,
            repairSlots,
            latestReplaySlot,
            firstTurbineSlot,
            latestTurbineSlot,
            turbineSlots,
          } = dataRef.current;

          const latestTurbineBarIndex = getMaxBarIndexForSlot(
            latestTurbineSlot,
            startSlot,
            slotsPerBar,
            totalBarsThatFit - 1,
          );
          const firstTurbineBarIndex = getMaxBarIndexForSlot(
            firstTurbineSlot,
            startSlot,
            slotsPerBar,
            totalBarsThatFit - 1,
          );

          // reposition labels and footer
          const catchingUpContainerEl = store.get(catchingUpContainerElAtom);
          catchingUpContainerEl?.style.setProperty(
            "--turbine-start-x",
            `${
              getX(firstTurbineBarIndex, barWidth, gapWidth) /
              window.devicePixelRatio
            }px`,
          );
          catchingUpContainerEl?.style.setProperty(
            "--turbine-head-x",
            `${
              getX(latestTurbineBarIndex, barWidth, gapWidth) /
              window.devicePixelRatio
            }px`,
          );

          const barXByColors = new Map<string, number[]>();

          for (
            let barIndex = 0;
            barIndex <= latestTurbineBarIndex;
            barIndex++
          ) {
            const slotsBeforeBar = barIndex * slotsPerBar;
            const firstSlotInBar = startSlot + Math.trunc(slotsBeforeBar);

            const prevSlotsIncludingBar = (barIndex + 1) * slotsPerBar;
            const lastSlotInBar = Math.min(
              latestTurbineSlot,
              startSlot + Math.ceil(prevSlotsIncludingBar) - 1,
            );

            const x = getX(barIndex, barWidth, gapWidth);

            const color = getBarColor(
              firstSlotInBar,
              lastSlotInBar,
              latestReplaySlot,
              repairSlots,
              barIndex === firstTurbineBarIndex,
              barIndex === latestTurbineBarIndex,
              turbineSlots,
            );

            const barXs = barXByColors.get(color) ?? [];
            barXs.push(x);
            barXByColors.set(color, barXs);
          }

          for (const [color, barXs] of barXByColors.entries()) {
            ctx.fillStyle = color;
            ctx.beginPath();
            for (const x of barXs) {
              ctx.roundRect(x, y, barWidth, height, radius);
            }
            ctx.fill();
          }

          ctx.restore();
        },
      ],
    },
  };
}

function getX(barIndex: number, barWidth: number, gapWidth: number) {
  return barIndex * (barWidth + gapWidth);
}
