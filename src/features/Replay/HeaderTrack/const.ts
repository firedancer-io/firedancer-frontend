import type * as THREE from "three";
import type { WebglResources, RectMesh } from "../../WebGl/webglUtils";

// TODO: set to reasonable transition value
export const HEADER_AGG_THRESHOLD_MS = 0;

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  aggResources: AggRendererResources;
  // TODO: add nonAggResources
  cleanUp: () => void;
};

export interface AggRendererResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  resources: WebglResources;
  mesh: RectMesh;
  /**
   * origin ms subtracted from both the camera bounds and
   * the rectangle geometry so the GPU works with small, float32-precise coordinates
   * instead of ~3.4e8.
   * Mesh position x values must be updated when this changes
   */
  cameraReferenceMs: number;
}
