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

export const SHREDS_OPACITY = 0.8;

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
