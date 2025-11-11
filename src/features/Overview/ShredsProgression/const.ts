import { ShredEvent } from "../../../api/entities";
import {
  shredRepairRequestedColor,
  shredReceivedTurbineColor,
  shredReceivedRepairColor,
  shredReplayedColor,
  shredReplayStartedColor,
} from "../../../colors";

export const xRangeMs = 10_000;
export const delayMs = 50;

export const shredColors: {
  [key in Exclude<ShredEvent, ShredEvent.slot_complete>]: string;
} = {
  [ShredEvent.shred_repair_request]: shredRepairRequestedColor,
  [ShredEvent.shred_received_turbine]: shredReceivedTurbineColor,
  [ShredEvent.shred_received_repair]: shredReceivedRepairColor,
  [ShredEvent.shred_replay_start]: shredReplayStartedColor,
  [ShredEvent.shred_replayed]: shredReplayedColor,
};

/**
 * Draw highest to lowest priority events.
 * Ignore lower priority events that overlap.
 */
export const shredEventDescPriorities: Exclude<
  ShredEvent,
  ShredEvent.slot_complete
>[] = [
  ShredEvent.shred_replayed,
  ShredEvent.shred_replay_start,
  ShredEvent.shred_received_repair,
  ShredEvent.shred_received_turbine,
  ShredEvent.shred_repair_request,
];
