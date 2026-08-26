import { clamp } from "../../../mathUtils";
import type uPlot from "uplot";
import { getDefaultStore } from "jotai";
import {
  liveShredsDataAtom,
  liveShredsPostStartupLeaderSlotsAtom,
  liveShredsPostStartupRangeAtom,
} from "./atoms";
import { rowShredEventDescPriorities, shredEventDescPriorities } from "./const";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import {
  gridLineColor,
  shredPublishedColor,
  shredReceivedRepairColor,
  shredReceivedTurbineColor,
  shredRepairRequestedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
  shredSkippedColor,
} from "../../../colors";
import { serverTimeMsAtom, skippedClusterSlotsAtom } from "../../../atoms";
import { ShredEvent } from "../../../api/entityEnums";
import {
  createLabelsState,
  getAdjustedNow,
  getDrawInfo,
  type LabelState,
  type XRange,
} from "./utils";
import { computeLabelFrame, getXPos, type Position } from "./labelsCalc";
import { applyLabelFrame } from "./labelsApply";

import type { SlotsShreds, ShredEventTsDeltas } from "./atoms";

// re-exported from their new DOM-free home (labelsCalc.ts)
export {
  estimateSlotTsDeltas,
  getGroupTsDeltas,
  getSlotBlocks,
  type Position,
  type TsDeltasBySlot,
} from "./labelsCalc";

const store = getDefaultStore();

export const shredsXScaleKey = "shredsXScaleKey";

type Coordinates = [x: number, y: number, width?: number];
type EventsByFillStyle = {
  [fillStyle: string]: Array<Coordinates>;
};
export type LabelPositions = {
  groups: {
    [leaderSlotNumber: number]: Position;
  };
  slots: {
    [slotNumber: number]: Position;
  };
};

export function shredsProgressionPlugin(
  isOnStartupScreen: boolean,
): uPlot.Plugin {
  let prevLabels = createLabelsState();

  // use to get new map values without creating a new map every update
  let tempNewLabels: typeof prevLabels = createLabelsState();

  const prevTimeDiffs: number[] = [];

  return {
    hooks: {
      draw: [
        (u) => {
          if (isOnStartupScreen) {
            drawStartupChartAxes(u);
          }

          const serverTimeMs = store.get(serverTimeMsAtom);
          if (!serverTimeMs) return;

          const {
            slotsShreds: liveShreds,
            range: slotRange,
            minCompletedSlot,
          } = store.get(liveShredsDataAtom) ?? {};
          const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
          const rangeAfterStartup = store.get(liveShredsPostStartupRangeAtom);

          const { min: minXScale, max: maxXScale } = u.scales[shredsXScaleKey];

          if (
            !liveShreds ||
            !slotRange ||
            minXScale == null ||
            maxXScale == null
          ) {
            return;
          }

          if (!isOnStartupScreen) {
            // if startup is running, prevent drawing non-startup screen chart
            if (store.get(showStartupProgressAtom)) return;
            // Sometimes we've missed the completion event for the first slots
            // depending on connection time. Ignore those slots, and only draw slots
            // from min completed.
            if (minCompletedSlot == null) return;

            if (!rangeAfterStartup) return;
          }

          const adjustedNow = getAdjustedNow(serverTimeMs, prevTimeDiffs);

          const maxReferenceTs = adjustedNow - liveShreds.referenceTs;
          const tsSpan = maxXScale - minXScale;

          const xRange: XRange = {
            minDeltaTs: maxReferenceTs - tsSpan,
            maxDeltaTs: maxReferenceTs,
            minCanvasPos: u.bbox.left,
            maxCanvasPos: u.bbox.left + u.bbox.width,
            minCssPos: u.valToPos(minXScale, shredsXScaleKey, false),
            maxCssPos: u.valToPos(maxXScale, shredsXScaleKey, false),
          };

          const minSlot = isOnStartupScreen
            ? slotRange.min
            : Math.max(slotRange.min, minCompletedSlot ?? slotRange.min);
          const maxSlot = slotRange.max;

          const { maxShreds, orderedSlotNumbers } = getDrawInfo(
            minSlot,
            maxSlot,
            liveShreds,
            xRange,
          );

          const canvasHeight = isOnStartupScreen
            ? Math.trunc(u.bbox.height / 3)
            : u.bbox.height;

          const getYOffset = isOnStartupScreen
            ? (eventType: Exclude<ShredEvent, ShredEvent.slot_complete>) => {
                switch (eventType) {
                  case ShredEvent.shred_received_turbine:
                  case ShredEvent.shred_published: {
                    return 0;
                  }
                  case ShredEvent.shred_repair_request:
                  case ShredEvent.shred_received_repair: {
                    return canvasHeight;
                  }
                  case ShredEvent.shred_replayed: {
                    return canvasHeight * 2;
                  }
                }
              }
            : undefined;

          // each row is at least 1 px
          const rowPxHeight = clamp(canvasHeight / maxShreds, 1, 10);
          const gapPxHeight = 1;

          const dotSize = Math.max(rowPxHeight, 3);

          // n rows, n-1 gaps
          const rowsCount = Math.trunc(
            (canvasHeight + gapPxHeight) / (rowPxHeight + gapPxHeight),
          );
          const shredsPerRow = maxShreds / rowsCount;

          u.ctx.save();
          u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          u.ctx.clip();

          for (const slotNumber of orderedSlotNumbers) {
            const eventsByFillStyle: EventsByFillStyle = {};
            const addEventPosition = (
              fillStyle: string,
              position: Coordinates,
            ) => {
              eventsByFillStyle[fillStyle] ??= [];
              eventsByFillStyle[fillStyle].push(position);
            };

            const slot = liveShreds.slots.get(slotNumber);
            if (!slot) continue;

            const isSlotSkipped = skippedSlotsCluster.has(slotNumber);

            for (let rowIdx = 0; rowIdx < rowsCount; rowIdx++) {
              const shredsAboveRow = rowIdx * shredsPerRow;
              const firstShredIdx = Math.trunc(shredsAboveRow);

              const shredsAboveOrInRow = (rowIdx + 1) * shredsPerRow;
              const lastShredIdx = Math.min(
                maxShreds,
                Math.ceil(shredsAboveOrInRow) - 1,
              );

              addEventsForRow({
                addEventPosition,
                firstShredIdx,
                lastShredIdx,
                shreds: slot.shreds,
                slotCompletionTsDelta: slot.completionTsDelta,
                isSlotSkipped,
                drawOnlyDots: isOnStartupScreen,
                y: (rowPxHeight + gapPxHeight) * rowIdx + u.bbox.top,
                getYOffset,
                xRange,
              });
            }

            // draw events, one fillStyle at a time for this slot
            for (const fillStyle of Object.keys(eventsByFillStyle)) {
              u.ctx.beginPath();
              u.ctx.fillStyle = fillStyle;
              for (const [x, y, width] of eventsByFillStyle[fillStyle]) {
                if (width == null) {
                  // dot
                  u.ctx.rect(x, y, dotSize, dotSize);
                } else {
                  u.ctx.rect(x, y, width, rowPxHeight);
                }
              }
              u.ctx.fill();
            }
          }

          u.ctx.restore();

          if (!isOnStartupScreen && rangeAfterStartup) {
            updateLabels(
              rangeAfterStartup,
              liveShreds.slots,
              skippedSlotsCluster,
              xRange,
              prevLabels,
              tempNewLabels,
            );
            // switch map for reuse, don't create new maps each render
            [prevLabels, tempNewLabels] = [tempNewLabels, prevLabels];
            tempNewLabels.groups.clear();
            tempNewLabels.slots.clear();
          }
        },
      ],
    },
  };
}

/**
 * Draw grid lines to split y axis into thirds
 */
function drawStartupChartAxes(u: uPlot) {
  u.ctx.save();
  u.ctx.strokeStyle = gridLineColor;
  u.ctx.lineWidth = 1;
  u.ctx.beginPath();

  const left = u.bbox.left;
  const right = u.bbox.left + u.bbox.width;

  for (let i = 0; i < 3; i++) {
    u.ctx.moveTo(left, u.bbox.top + (u.bbox.height * i) / 3);
    u.ctx.lineTo(right, u.bbox.top + (u.bbox.height * i) / 3);
  }
  u.ctx.stroke();
  u.ctx.restore();
}

interface AddEventsForRowArgs {
  addEventPosition: (fillStyle: string, position: Coordinates) => void;
  firstShredIdx: number;
  lastShredIdx: number;
  shreds: (ShredEventTsDeltas | undefined)[];
  slotCompletionTsDelta: number | undefined;
  isSlotSkipped: boolean;
  drawOnlyDots: boolean;
  y: number;
  getYOffset?: (
    eventType: Exclude<ShredEvent, ShredEvent.slot_complete>,
  ) => number;
  xRange: XRange;
}
/**
 * Draw rows for shreds, with rectangles or dots for events.
 * Each row may represent partial or multiple shreds. Use the row shred priorities to determine
 * which shred to draw.
 */
function addEventsForRow({
  addEventPosition,
  firstShredIdx,
  lastShredIdx,
  shreds,
  slotCompletionTsDelta,
  drawOnlyDots,
  isSlotSkipped,
  y,
  getYOffset,
  xRange,
}: AddEventsForRowArgs) {
  const shredIdx = getShredIdxToDrawForRow(firstShredIdx, lastShredIdx, shreds);

  const eventTsDeltas = shreds[shredIdx];
  // no events to draw
  if (!eventTsDeltas) return;

  let endXPos: number =
    slotCompletionTsDelta == null
      ? // event goes to max x
        xRange.maxCanvasPos
      : getXPos(slotCompletionTsDelta, xRange, true);

  const eventPositions = new Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    Coordinates
  >();

  // draw events from highest to lowest priority
  for (const eventType of shredEventDescPriorities) {
    const tsDelta = eventTsDeltas[eventType];
    if (tsDelta == null) continue;

    const startXPos = getXPos(tsDelta, xRange, true);

    // ignore overlapping events with lower priority
    if (startXPos >= endXPos) continue;

    const yOffset = getYOffset?.(eventType) ?? 0;

    eventPositions.set(
      eventType,
      drawOnlyDots || isSlotSkipped
        ? [startXPos, y + yOffset]
        : [startXPos, y + yOffset, endXPos - startXPos],
    );
    endXPos = startXPos;
  }

  for (const [eventType, position] of eventPositions.entries()) {
    if (isSlotSkipped) {
      addEventPosition(shredSkippedColor, position);
      continue;
    }
    switch (eventType) {
      case ShredEvent.shred_repair_request: {
        addEventPosition(shredRepairRequestedColor, position);
        break;
      }
      case ShredEvent.shred_received_turbine: {
        addEventPosition(shredReceivedTurbineColor, position);
        break;
      }
      case ShredEvent.shred_received_repair: {
        addEventPosition(shredReceivedRepairColor, position);
        break;
      }
      case ShredEvent.shred_replayed: {
        if (eventPositions.has(ShredEvent.shred_received_repair)) {
          addEventPosition(shredReplayedRepairColor, position);
        } else if (eventPositions.has(ShredEvent.shred_received_turbine)) {
          addEventPosition(shredReplayedTurbineColor, position);
        } else {
          addEventPosition(shredReplayedNothingColor, position);
        }
        break;
      }
      case ShredEvent.shred_published: {
        addEventPosition(shredPublishedColor, position);
      }
    }
  }
}

function getShredIdxToDrawForRow(
  firstShredIdx: number,
  lastShredIdx: number,
  shreds: (ShredEventTsDeltas | undefined)[],
): number {
  for (const shredEvent of rowShredEventDescPriorities) {
    const shredIdx = findShredIdx(
      firstShredIdx,
      lastShredIdx,
      shreds,
      (shred: ShredEventTsDeltas | undefined) => shred?.[shredEvent] != null,
    );
    if (shredIdx !== -1) return shredIdx;
  }
  return firstShredIdx;
}

/**
 * Find first shred index that satisfies the condition.
 * Returns -1 if no shred passes the condition.
 */
function findShredIdx(
  firstShredIdx: number,
  lastShredIdx: number,
  shreds: (ShredEventTsDeltas | undefined)[],
  condition: (shred: ShredEventTsDeltas | undefined) => boolean,
) {
  for (let shredIdx = firstShredIdx; shredIdx < lastShredIdx; shredIdx++) {
    if (condition(shreds[shredIdx])) return shredIdx;
  }
  return -1;
}

export function updateLabels(
  slotRange: {
    min: number;
    max: number;
  },
  slots: SlotsShreds["slots"],
  skippedSlotsCluster: Set<number>,
  xRange: XRange,
  prevLabels: {
    groups: Map<number, LabelState>;
    slots: Map<number, LabelState>;
  },
  newLabels: {
    groups: Map<number, LabelState>;
    slots: Map<number, LabelState>;
  },
) {
  const leaderSlotsRange = store.get(liveShredsPostStartupLeaderSlotsAtom);
  if (!leaderSlotsRange) return;

  const frame = computeLabelFrame(
    slotRange,
    leaderSlotsRange,
    slots,
    skippedSlotsCluster,
    xRange,
  );
  applyLabelFrame(frame, prevLabels, newLabels);
}
