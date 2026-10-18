import { SHRED_EVENT_TYPES_COUNT } from "../../../api/entities";
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
import { convertToWebGlColor } from "../../WebGl/webglUtils";
import { SHREDS_PER_FEC_SET } from "../const";

export const SHREDS_OPACITY = 0.8;
// 700 shreds, all events except completion could have a rectangle
export const SHRED_MESH_CAPACITY = 700 * (SHRED_EVENT_TYPES_COUNT - 1);
export const FEC_MESH_CAPACITY = Math.round(
  SHRED_MESH_CAPACITY / SHREDS_PER_FEC_SET,
);

export const colors = {
  skipped: convertToWebGlColor(shredSkippedColor),
  repairRequested: convertToWebGlColor(shredRepairRequestedColor),
  receivedTurbine: convertToWebGlColor(shredReceivedTurbineColor),
  receivedRepair: convertToWebGlColor(shredReceivedRepairColor),
  replayedRepair: convertToWebGlColor(shredReplayedRepairColor),
  replayedTurbine: convertToWebGlColor(shredReplayedTurbineColor),
  replayedNothing: convertToWebGlColor(shredReplayedNothingColor),
  published: convertToWebGlColor(shredPublishedColor),
};
