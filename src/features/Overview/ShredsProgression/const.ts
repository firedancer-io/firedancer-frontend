import { ShredEvent } from "../../../api/entities";
import {
  shredRepairRequestedColor,
  shredReceivedTurbineColor,
  shredReceivedRepairColor,
  shredReplayedColor,
} from "../../../colors";

export const xRangeMs = 10_000;
export const delayMs = 50;

export const shredColors: {
  [key in Exclude<ShredEvent, ShredEvent.slot_complete>]: string;
} = {
  [ShredEvent.shred_repair_request]: shredRepairRequestedColor,
  [ShredEvent.shred_received_turbine]: shredReceivedTurbineColor,
  [ShredEvent.shred_received_repair]: shredReceivedRepairColor,
  [ShredEvent.shred_replayed]: shredReplayedColor,
};
