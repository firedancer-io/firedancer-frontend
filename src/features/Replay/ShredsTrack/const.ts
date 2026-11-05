import type * as THREE from "three";
import type { RectResources, RectMesh } from "../../WebGl/webglUtils";
import type { DrawableSlot } from "../../Shreds/chartUtils";
import { AggShredEventType } from "../../../api/entities";
import {
  shredPublishedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
} from "../../../colors";
import { colors as shredWebGlColors } from "../../Shreds/WebGl/const";

export const SHREDS_AGG_THRESHOLD_MS = 180_000;

export const AGG_SHREDS_CHART_ID = "agg-shreds-track";
export const NON_AGG_SHREDS_CHART_ID = "non-agg-shreds-track";

/**
 * Height ceiling for the max value so the axis ends ~105% past the data, leaving
 * headroom above the tallest column.
 */
export const MAX_HEIGHT_RATIO = 0.95;

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  aggResources: AggRendererResources;
  nonAggResources: NonAggRendererResources;
  cleanUp: () => void;
};

export interface NonAggRendererResources {
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
  lastDrawInfo?: NonAggDrawInfo;
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
export const shredEventSeries = [
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
