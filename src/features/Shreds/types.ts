import type * as THREE from "three";
import type { RectMesh, RectResources } from "../WebGl/webglUtils";
import type { EdgeResourceBundle } from "./WebGl/edgeUtils";
import type { DrawInfo } from "./WebGl/shredHover";
import type { SlotHighlight } from "../Replay/slotHighlight";

export type RendererObj<MeshKey extends string | number = number> = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  meshes: Map<MeshKey, RectMesh>;
  availableMeshes: RectMesh[];
  // resources shared by this renderer's slot meshes
  resources: RectResources;
  highlight: SlotHighlight;
  lastDrawInfo?: DrawInfo;
  cleanUp: () => void;
} & EdgeResourceBundle<MeshKey>;

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
  /**
   * Replay only
   */
  skipped?: boolean;
  /**
   * Replay only
   */
  tiles?: Set<number>;
};

export type SlotsShreds = {
  // reference ts in ns; event ts deltas below are ms relative to this
  referenceTs: bigint;
  // slot number to Slot
  slots: Map<number, Slot>;
};

export interface SlotRange {
  min: number;
  max: number;
}
