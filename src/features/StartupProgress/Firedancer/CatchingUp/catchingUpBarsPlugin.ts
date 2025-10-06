import type { MutableRefObject } from "react";
import { getDefaultStore } from "jotai";

import { catchingUpContainerElAtom, type CatchingUpData } from "./atoms";
import { getBarColor, getMaxBarIndexForSlot } from "./utils";

const store = getDefaultStore();

const barWidthPx = 4;
const gapWidthPx = barWidthPx;

export function catchingUpBarsPlugin(
  totalSlotsRef: MutableRefObject<number | undefined>,
  dataRef: MutableRefObject<CatchingUpData | undefined>,
): uPlot.Plugin {
  return {
    hooks: {
      drawSeries: [
        (u) => {
          if (totalSlotsRef.current == null || !dataRef.current) {
            return;
          }

          const ctx = u.ctx;
          ctx.save();

          const y = u.bbox.top;
          const height = u.bbox.height;

          const barWidth = barWidthPx * window.devicePixelRatio;
          const gapWidth = gapWidthPx * window.devicePixelRatio;

          const totalBarsThatFit = Math.trunc(
            (u.bbox.width + gapWidth) / (barWidth + gapWidth),
          );

          const totalSlotsCount = totalSlotsRef.current;
          const slotsPerBar = totalSlotsCount / totalBarsThatFit;

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

            const radius = barWidth / 2;
            drawBar(ctx, color, x, y, barWidth, height, radius);
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

function drawBar(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  barWidth: number,
  height: number,
  radius: number,
) {
  ctx.fillStyle = color;

  // draw corners clockwise, starting with top left
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius, Math.PI, 1.5 * Math.PI);
  ctx.arc(x + barWidth - radius, y + radius, radius, 1.5 * Math.PI, 0);
  ctx.arc(x + barWidth - radius, y + height - radius, radius, 0, 0.5 * Math.PI);
  ctx.arc(x + radius, y + height - radius, radius, 0.5 * Math.PI, Math.PI);
  ctx.closePath();
  ctx.fill();
}
