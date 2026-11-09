import type * as THREE from "three";
import type { RectResources, RectMesh } from "../../WebGl/webglUtils";

export const trackHeight = 36;
export const trackMarginTop = 6;
export const trackMarginBottom = 4;
export const aggTrackHeight = 30;
// the agg track is bottom-aligned; epoch pins extend into the space above it
export const aggTrackOverhang = trackHeight - aggTrackHeight;

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
