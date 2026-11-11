import type * as THREE from "three";
import type { RectResources, RectMesh } from "../../WebGl/webglUtils";
import type { DrawableSlot } from "../../Shreds/chartUtils";
import type { SlotHighlight } from "../slotHighlight";
import type { EdgeResourceBundle } from "../../Shreds/WebGl/edgeUtils";
import type { createSmoothPass } from "../../WebGl/smoothPass";
import { AggShredEventType } from "../../../api/entities";
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
import { colors as shredWebGlColors } from "../../Shreds/WebGl/const";

export const AGG_SHREDS_CHART_ID = "agg-shreds-track";
export const NON_AGG_SHREDS_CHART_ID = "non-agg-shreds-track";

/**
 * Height ceiling for headroom above the tallest column.
 */
export const MAX_HEIGHT_RATIO = 0.95;

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  aggResources: AggRendererResources;
  nonAggResources: NonAggRendererResources;
  cleanUp: () => void;
};

export interface NonAggRendererResources extends EdgeResourceBundle<string> {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  meshes: Map<string, RectMesh>;
  availableMeshes: RectMesh[];
  /** mesh for hovered shred highlight */
  highlightMesh: RectMesh;
  resources: RectResources;
  /**
   * origin ms subtracted from both the camera bounds and
   * the rectangle geometry so the GPU works with small, float32-precise coordinates
   * instead of ~3.4e8.
   * Mesh position x values must be updated when this changes
   */
  cameraReferenceMs: number;
  highlight: SlotHighlight;
  lastDrawInfo?: NonAggDrawInfo;
  /**
   * Mesh keys whose slot data changed since the last draw. The next draw
   * redraws them in place, so the old geometry stays visible until then.
   */
  staleMeshKeys: Set<string>;
  smoothPass: ReturnType<typeof createSmoothPass>;
}

export interface NonAggDrawInfo {
  /** drawn slots, ascending by slotNumber */
  slots: DrawableSlot[];
  /**
   * Right edge each incomplete unskipped slot's bars were drawn to, by mesh key
   */
  incompleteRightEdges: Map<string, number>;
}

export interface AggRendererResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  resources: RectResources;
  mesh: RectMesh;
  /**
   * origin ms subtracted from both the camera bounds and
   * the rectangle geometry so the GPU works with small, float32-precise coordinates
   * instead of ~3.4e8.
   * Mesh position x values must be updated when this changes
   */
  cameraReferenceMs: number;
}

/** Listed in stacking order */
export const aggShredEvents = [
  {
    type: AggShredEventType.Repair,
    label: "Repair",
    color: shredReplayedRepairColor,
    webGlColor: shredWebGlColors.replayedRepair,
  },
  {
    type: AggShredEventType.Reconstructed,
    label: "Reconstructed",
    color: shredReplayedNothingColor,
    webGlColor: shredWebGlColors.replayedNothing,
  },
  {
    type: AggShredEventType.Turbine,
    label: "Turbine",
    color: shredReplayedTurbineColor,
    webGlColor: shredWebGlColors.replayedTurbine,
  },
  {
    type: AggShredEventType.Published,
    label: "Published",
    color: shredPublishedColor,
    webGlColor: shredWebGlColors.published,
  },
];

/**
 * Full set of shred colors for the legend, matching the colors and order
 * from ShredsChartLegend. The aggregated chart only renders the subset in
 * aggShredEvents, but the non-aggregated chart draws all of these.
 */
export const shredLegend = [
  { label: "Repair Requested", color: shredRepairRequestedColor },
  { label: "Received Turbine", color: shredReceivedTurbineColor },
  { label: "Received Repair", color: shredReceivedRepairColor },
  { label: "Replayed Turbine", color: shredReplayedTurbineColor },
  { label: "Replayed Repair", color: shredReplayedRepairColor },
  { label: "Replayed Nothing", color: shredReplayedNothingColor },
  { label: "Skipped", color: shredSkippedColor },
  { label: "Published", color: shredPublishedColor },
];
