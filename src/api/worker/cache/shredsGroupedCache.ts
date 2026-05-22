import { clamp } from "lodash";
import { ShredEvent } from "../../../api/entities";
import {
  shredPublishedColor,
  shredReceivedRepairColor,
  shredReceivedTurbineColor,
  shredRepairRequestedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
} from "../../../colors";
import {
  rowShredEventDescPriorities,
  shredEventDescPriorities,
} from "../../../features/Overview/ShredsProgression/const";
import type { ShredEventTsDeltas } from "../../../features/Overview/ShredsProgression/types";
import { shredsPublishIntervalMs } from "./consts";
import {
  createBatchPublisher,
  type PublisherEntry,
  type PublisherOptions,
} from "./batchPublisher";
import type {
  ChartDrawData,
  ChartDrawItem,
  DrawRow,
  DrawRowEvent,
  SlotDrawData,
} from "../types";
import type { LiveShredsData } from "../../../features/Overview/ShredsProgression/types";

export interface ChartScaleParams {
  scaleMin: number;
  scaleMax: number;
  bboxHeight: number;
  isOnStartupScreen: boolean;
}

interface ShredsGroupedEntry extends PublisherEntry {
  scaleParams?: ChartScaleParams;
}

const gapPxHeight = 1;

export function createShredsGroupedCache<K extends string>(
  post: (items: ChartDrawItem[]) => void,
  getShredsData: () => LiveShredsData | undefined,
) {
  const publisher = createBatchPublisher<
    ShredsGroupedEntry,
    PublisherOptions,
    ChartDrawItem
  >({
    createEntry: (key, options) => ({
      key,
      subscribed: false,
      lastPublishMs: 0,
      publishIntervalMs: options.publishIntervalMs,
    }),
    collect: (entry) => {
      const { scaleParams } = entry;
      if (!scaleParams) return undefined;
      const data = computeChartDrawData(getShredsData(), scaleParams);
      if (!data) return undefined;
      return { key: entry.key, data };
    },
    post,
  });

  return {
    subscribe: publisher.subscribe,
    unsubscribe: publisher.unsubscribe,
    reset: publisher.reset,
    updateScale: (key: K, params: ChartScaleParams) => {
      const entry = publisher.get(key);
      if (!entry) return;
      entry.scaleParams = params;
      publisher.forcePublish(key);
    },
  };
}

function computeChartDrawData(
  liveShredsData: LiveShredsData | undefined,
  scaleParams: ChartScaleParams,
): ChartDrawData | undefined {
  const { slotsShreds, range: slotRange, minCompletedSlot } =
    liveShredsData ?? {};
  if (!slotsShreds || !slotRange) return undefined;

  const { bboxHeight, isOnStartupScreen } = scaleParams;
  const canvasHeight = isOnStartupScreen
    ? Math.trunc(bboxHeight / 3)
    : bboxHeight;

  let maxShreds = 0;
  const rawSlots: Array<{
    slotNumber: number;
    minEventTsDelta: number;
    completionTsDelta: number | undefined;
    shreds: (ShredEventTsDeltas | undefined)[];
  }> = [];

  for (
    let slotNumber = slotRange.min;
    slotNumber <= slotRange.max;
    slotNumber++
  ) {
    const slot = slotsShreds.slots.get(slotNumber);
    if (!slot || !slot.shreds.length || slot.minEventTsDelta == null) continue;

    maxShreds = Math.max(maxShreds, slot.shreds.length);
    rawSlots.push({
      slotNumber,
      minEventTsDelta: slot.minEventTsDelta,
      completionTsDelta: slot.completionTsDelta,
      shreds: slot.shreds,
    });
  }

  if (!rawSlots.length) return undefined;

  const rowPxHeight = clamp(canvasHeight / maxShreds, 1, 10);
  const rowsCount = Math.trunc(
    (canvasHeight + gapPxHeight) / (rowPxHeight + gapPxHeight),
  );
  const shredsPerRow = maxShreds / rowsCount;

  const slots: SlotDrawData[] = rawSlots.map((slot) => ({
    slotNumber: slot.slotNumber,
    minEventTsDelta: slot.minEventTsDelta,
    completionTsDelta: slot.completionTsDelta,
    rows: computeSlotRows(slot.shreds, slot.completionTsDelta, maxShreds, rowsCount, shredsPerRow),
  }));

  return {
    referenceTs: slotsShreds.referenceTs,
    slots,
    maxShreds,
    minCompletedSlot,
    range: slotRange,
  };
}

function computeSlotRows(
  shreds: (ShredEventTsDeltas | undefined)[],
  completionTsDelta: number | undefined,
  maxShreds: number,
  rowsCount: number,
  shredsPerRow: number,
): DrawRow[] {
  const rows: DrawRow[] = [];

  for (let rowIdx = 0; rowIdx < rowsCount; rowIdx++) {
    const shredsAboveRow = rowIdx * shredsPerRow;
    const firstShredIdx = Math.trunc(shredsAboveRow);

    const shredsAboveOrInRow = (rowIdx + 1) * shredsPerRow;
    const lastShredIdx = Math.min(maxShreds, Math.ceil(shredsAboveOrInRow) - 1);

    rows.push(computeRowEvents(firstShredIdx, lastShredIdx, shreds, completionTsDelta));
  }

  return rows;
}

/**
 * Compute draw events for a single row in tsDelta space.
 * Mirrors the logic of addEventsForRow from the plugin, but works without
 * pixel coordinates — the main thread applies tsXValueOffset and getXPos.
 */
function computeRowEvents(
  firstShredIdx: number,
  lastShredIdx: number,
  shreds: (ShredEventTsDeltas | undefined)[],
  completionTsDelta: number | undefined,
): DrawRow {
  const row: DrawRow = { endTsDelta: completionTsDelta, events: [] };

  const shredIdx = getShredIdxToDrawForRow(firstShredIdx, lastShredIdx, shreds);
  const eventTsDeltas = shreds[shredIdx];
  if (!eventTsDeltas) return row;

  const hasReceivedRepair = eventTsDeltas[ShredEvent.shred_received_repair] != null;
  const hasReceivedTurbine = eventTsDeltas[ShredEvent.shred_received_turbine] != null;

  let currentEndTsDelta = completionTsDelta;
  const events: DrawRowEvent[] = [];

  for (const eventType of shredEventDescPriorities) {
    const tsDelta = eventTsDeltas[eventType];
    if (tsDelta == null) continue;

    // Overlap check in tsDelta space: skip if event starts at or after the current end
    if (currentEndTsDelta != null && tsDelta >= currentEndTsDelta) continue;

    let fillStyle: string;
    switch (eventType) {
      case ShredEvent.shred_repair_request:
        fillStyle = shredRepairRequestedColor;
        break;
      case ShredEvent.shred_received_turbine:
        fillStyle = shredReceivedTurbineColor;
        break;
      case ShredEvent.shred_received_repair:
        fillStyle = shredReceivedRepairColor;
        break;
      case ShredEvent.shred_replayed:
        fillStyle = hasReceivedRepair
          ? shredReplayedRepairColor
          : hasReceivedTurbine
            ? shredReplayedTurbineColor
            : shredReplayedNothingColor;
        break;
      case ShredEvent.shred_published:
        fillStyle = shredPublishedColor;
        break;
      default:
        continue;
    }

    events.push({ fillStyle, startTsDelta: tsDelta });
    currentEndTsDelta = tsDelta;
  }

  row.events = events;
  return row;
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
