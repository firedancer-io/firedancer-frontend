import { ShredEvent } from "../../../api/entities";
import {
  shredPublishedColor,
  shredReceivedRepairColor,
  shredReceivedTurbineColor,
  shredRepairRequestedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
  shredSkippedColor,
} from "../../../colors";

export const xRangeMs = 10_000;
export const delayMs = 50;

/**
 * Draw highest to lowest priority events.
 * Ignore lower priority events that overlap.
 */
export const shredEventDescPriorities: Exclude<
  ShredEvent,
  ShredEvent.slot_complete
>[] = [
  ShredEvent.shred_published,
  ShredEvent.shred_replayed,
  ShredEvent.shred_received_repair,
  ShredEvent.shred_received_turbine,
  ShredEvent.shred_repair_request,
];

export const legend = {
  "Repair Requested": shredRepairRequestedColor,
  "Received Turbine": shredReceivedTurbineColor,
  "Received Repair": shredReceivedRepairColor,
  "Replayed Turbine": shredReplayedTurbineColor,
  "Replayed Repair": shredReplayedRepairColor,
  "Replayed Nothing": shredReplayedNothingColor,
  Skipped: shredSkippedColor,
  Published: shredPublishedColor,
};
