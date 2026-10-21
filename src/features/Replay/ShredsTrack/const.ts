import type * as THREE from "three";
import type { RectResources, RectMesh } from "../../WebGl/webglUtils";
import { AggShredEventType } from "../../../api/entities";
import {
  shredPublishedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
} from "../../../colors";
import { colors as shredWebGlColors } from "../../Shreds/WebGl/const";

// TODO: set to reasonable transition value
export const SHREDS_AGG_THRESHOLD_MS = 0;

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  aggResources: AggRendererResources;
  // TODO: add nonAggResources
  cleanUp: () => void;
};

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
