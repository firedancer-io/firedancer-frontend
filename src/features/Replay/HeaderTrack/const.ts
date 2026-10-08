import type * as THREE from "three";
import type { RectResources, RectMesh } from "../../WebGl/webglUtils";

export const HEADER_AGG_THRESHOLD_MS = 90_000;

export const slotGroupRowHeight = 12;
export const slotNumberRowHeight = 24;
export const slotBorderHeight = 3;
export const trackHeight = slotGroupRowHeight + slotNumberRowHeight;

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  aggResources: AggRendererResources;
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
