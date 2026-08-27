import type * as THREE from "three";
import type { RendererResources as NonAggRendererResources } from "../../Overview/ShredsProgression/WebGl/chartUtils.ts";
import type { WebglResources, RectMesh } from "../../WebGl/webglUtils";

export interface AggRendererResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  /* resources shared by this renderer's slot meshes */
  resources: WebglResources;
  prevMesh: RectMesh;
  currentMesh: RectMesh;
  /**
   * origin ms subtracted from both the camera bounds and
   * the rectangle geometry so the GPU works with small, float32-precise coordinates
   * instead of ~3.4e8.
   * Mesh position x values must be updated when this changes
   */
  cameraReferenceMs: number;
}

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  cleanUp: () => void;
  nonAgg: NonAggRendererResources;
  agg: AggRendererResources;
};

export const SHREDS_AGG_THRESHOLD_MS = 400_000;
