import uPlot from "uplot";
import { getDefaultStore } from "jotai";
import {
  getLiveShredsAtoms,
  type ShredEventTsDeltas,
  type SlotsShreds,
} from "./atoms";
import { delayMs, shredColors } from "./const";
import type { ShredEvent } from "../../../api/entities";
import { startupFinalTurbineHeadAtom } from "../../StartupProgress/atoms";
import { shredSkippedColor } from "../../../colors";
import { skippedClusterSlotsAtom } from "../../../atoms";

const store = getDefaultStore();

export function shredsProgressionPlugin(
  drawOnlyBeforeFirstTurbine: boolean,
  drawOnlyDots: boolean,
  pauseDuringStartup: boolean,
): uPlot.Plugin {
  return {
    hooks: {
      drawSeries: [
        (u, sidx) => {
          // ignore x axis
          if (sidx === 0) return;

          const atoms = getLiveShredsAtoms(drawOnlyBeforeFirstTurbine);

          const liveShreds = store.get(atoms.slotsShreds);
          const slotRange = store.get(atoms.range);
          const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);

          if (!liveShreds || !slotRange) {
            return;
          }

          const startupFinalTurbineHead = store.get(
            startupFinalTurbineHeadAtom,
          );

          if (pauseDuringStartup && startupFinalTurbineHead == null) {
            return;
          }

          // Offset to convert shred event delta to chart x value
          const delayedNow = new Date().getTime() - delayMs;
          const tsXValueOffset = delayedNow - liveShreds.referenceTs;

          const minSlot =
            pauseDuringStartup && startupFinalTurbineHead != null
              ? Math.max(startupFinalTurbineHead, slotRange.min)
              : slotRange.min;
          const maxSlot = slotRange.max;

          uPlot.orient(
            u,
            sidx,
            (
              _series,
              _dataX,
              _dataY,
              scaleX,
              _scaleY,
              valToPosX,
              _valToPosY,
              xOff,
              _yOff,
              xDim,
              _yDim,
              _moveTo,
              _lineTo,
              rect,
            ) => {
              u.ctx.save();
              rect(u.ctx, u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
              u.ctx.clip();

              // helper to get x pos
              const getXPos = (xVal: number) =>
                valToPosX(xVal, scaleX, xDim, xOff);

              const { maxShreds, orderedSlotNumbers } = getDrawInfo(
                minSlot,
                maxSlot,
                liveShreds,
                scaleX,
                tsXValueOffset,
              );

              const canvasHeight = u.bbox.height;
              const shredPxHeight = canvasHeight / maxShreds;

              for (const slotNumber of orderedSlotNumbers) {
                const slot = liveShreds.slots[slotNumber];
                const isSlotSkipped = skippedSlotsCluster.has(slotNumber);

                for (
                  let shredIdx = 0;
                  shredIdx < slot.shreds.length;
                  shredIdx++
                ) {
                  const eventTsDeltas = slot.shreds[shredIdx];
                  if (!eventTsDeltas) continue;

                  drawShred({
                    drawOnlyDots,
                    isSlotSkipped,
                    u,
                    eventTsDeltas: slot.shreds[shredIdx],
                    slotCompletionTsDelta: slot.completionTsDelta,
                    tsXValueOffset,
                    y: shredPxHeight * shredIdx + u.bbox.top,
                    height: Math.max(1, shredPxHeight),
                    scaleX,
                    getXPos,
                  });
                }
              }

              u.ctx.restore();
            },
          );
        },
      ],
    },
  };
}

/**
 * Get slots in draw order
 * and max shreds count per slot for scaling
 */
const getDrawInfo = (
  minSlotNumber: number,
  maxSlotNumber: number,
  liveShreds: SlotsShreds,
  scaleX: uPlot.Scale,
  tsXValueOffset: number,
) => {
  const orderedSlotNumbers = [];
  let maxShreds = 0;

  for (
    let slotNumber = minSlotNumber;
    slotNumber <= maxSlotNumber;
    slotNumber++
  ) {
    const slot = liveShreds.slots[slotNumber];
    if (!slot || !slot.shreds.length || slot.minEventTsDelta == null) {
      // slot has no events
      continue;
    }

    if (
      scaleX.max != null &&
      slot.minEventTsDelta - tsXValueOffset > scaleX.max
    ) {
      // slot started after chart max X
      continue;
    }

    if (
      scaleX.min != null &&
      slot.completionTsDelta != null &&
      slot.completionTsDelta - tsXValueOffset < scaleX.min
    ) {
      // slot completed before chart min X
      continue;
    }

    orderedSlotNumbers.push(slotNumber);
    maxShreds = Math.max(maxShreds, slot.shreds.length);
  }

  return {
    maxShreds,
    orderedSlotNumbers,
  };
};

interface DrawShredArgs {
  drawOnlyDots: boolean;
  isSlotSkipped: boolean;
  u: uPlot;
  eventTsDeltas: ShredEventTsDeltas;
  slotCompletionTsDelta: number | undefined;
  tsXValueOffset: number;
  y: number;
  height: number;
  scaleX: uPlot.Scale;
  getXPos: (xVal: number) => number;
}
/**
 * Draw event rectangles or dots for shred
 */
function drawShred({
  drawOnlyDots,
  isSlotSkipped,
  u,
  eventTsDeltas,
  slotCompletionTsDelta,
  tsXValueOffset,
  y,
  height,
  scaleX,
  getXPos,
}: DrawShredArgs) {
  if (scaleX.max == null || scaleX.min == null) return;

  const shouldDrawDots = drawOnlyDots || isSlotSkipped;

  // filter to non-empty events
  const events = eventTsDeltas.reduce<
    {
      eventType: Exclude<ShredEvent, ShredEvent.slot_complete>;
      tsDelta: number;
    }[]
  >((acc, tsDelta, eventType) => {
    if (tsDelta == null) return acc;
    acc.push({
      eventType,
      tsDelta,
    });
    return acc;
  }, []);

  for (let i = 0; i < events.length; i++) {
    const { eventType, tsDelta } = events[i];

    const startXValue = tsDelta - tsXValueOffset;
    const startXPos = getXPos(startXValue);

    if (startXValue > scaleX.max) {
      // this event starts after max x; no further events to draw
      return;
    }

    u.ctx.fillStyle = isSlotSkipped
      ? shredSkippedColor
      : (shredColors[eventType] ?? "transparent");

    if (shouldDrawDots) {
      drawDot(u, startXPos, y, height);
    }

    const nextEventStartTsDelta = events[i + 1]?.tsDelta;

    // if event does not end, draw rectangle to max x
    if (slotCompletionTsDelta == null && nextEventStartTsDelta == null) {
      if (!shouldDrawDots) {
        const endXPos = u.bbox.left + u.bbox.width;
        u.ctx.fillRect(startXPos, y, endXPos - startXPos, height);
      }
      return;
    }

    // End this event at slot completion, and ignore events after slot completion
    if (
      slotCompletionTsDelta != null &&
      (nextEventStartTsDelta == null ||
        slotCompletionTsDelta < nextEventStartTsDelta)
    ) {
      if (!shouldDrawDots) {
        const endXPos = getXPos(slotCompletionTsDelta - tsXValueOffset);
        u.ctx.fillRect(startXPos, y, endXPos - startXPos, height);
      }

      return;
    }

    if (!drawDot) {
      const endXPos = getXPos(nextEventStartTsDelta - tsXValueOffset);
      u.ctx.fillRect(startXPos, y, endXPos - startXPos, height);
    }
  }
}

function drawDot(u: uPlot, x: number, y: number, size: number) {
  u.ctx.fillRect(x, y, size, size);
}
