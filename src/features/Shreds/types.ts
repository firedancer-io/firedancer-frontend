import type * as THREE from "three";
import type { RectMesh, TsRange, WebglResources } from "../WebGl/webglUtils";

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  meshes: Map<number, RectMesh>;
  availableMeshes: RectMesh[];
  worldTsRange: TsRange;
  // resources shared by this renderer's slot meshes
  resources: WebglResources;
  cleanUpRenderer: () => void;
};

export type ShredEventTsDeltaMs = number | undefined;
/**
 * Array of <event ts delta in ms>.
 * Array index, i corresponds to the shred event type.
 * The ts delta is relative to the referenceTs.
 */
export type ShredEventTsDeltas = ShredEventTsDeltaMs[];

export type Slot = {
  shreds: (ShredEventTsDeltas | undefined)[];
  /**
   * earliest event (start) of the slot
   */
  minEventTsDelta?: number;
  maxEventTsDelta?: number;
  completionTsDelta?: number;
};

export type SlotsShreds = {
  referenceTs: number;
  // slot number to Slot
  slots: Map<number, Slot>;
};
