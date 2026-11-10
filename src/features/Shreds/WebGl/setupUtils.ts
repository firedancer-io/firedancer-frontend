import * as THREE from "three";
import type { RectMesh } from "../../WebGl/webglUtils";
import {
  createRectResources,
  createRectMesh,
  createRenderer,
  disposeRectResources,
} from "../../WebGl/webglUtils";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import type { RendererObj } from "../types";
import { SHREDS_OPACITY } from "./const";
import { setUpEdgeResources, cleanUpEdgeResources } from "./edgeUtils";
import { disposeSlotMaterials } from "./drawUtils";
import { SHRED_EVENT_TYPES_COUNT } from "../../../api/entities";
import { createSlotHighlight } from "../../Replay/slotHighlight";

export function setUpRendererResources<MeshKey extends string | number>(
  getWasContextLost: ContextHelpers["getWasContextLost"],
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.5, 10);
  camera.position.z = 1;

  const meshes = new Map<MeshKey, RectMesh>();
  const availableMeshes: RectMesh[] = [];
  const resources = createRectResources(SHREDS_OPACITY);
  const cleanUpResources = () => {
    // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
    // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
    // Three doesn't restore GPU objects for restored contexts unless there's a render.
    // Remount on restore to reset the context listeners state
    if (!getWasContextLost()) {
      for (const slotMesh of meshes.values()) {
        slotMesh.mesh.geometry.dispose();
      }
      for (const slotMesh of availableMeshes) {
        slotMesh.mesh.geometry.dispose();
      }
      // dispose this chart's own unitQuad / sharedMaterial
      disposeRectResources(resources);
    }
  };

  return {
    camera,
    scene,
    meshes,
    availableMeshes,
    resources,
    cleanUpResources,
  };
}

export function setUpLiveRenderer(
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const rendererObj = createRenderer(setUpContextListeners, getWasContextLost);
  if (!rendererObj) return;

  const { renderer, cleanUpRenderer: cleanUpRendererContext } = rendererObj;
  const {
    camera,
    scene,
    meshes,
    availableMeshes,
    resources,
    cleanUpResources,
  } = setUpRendererResources<number>(getWasContextLost);

  const { edgeResources, edgeMeshes, availableEdgeMeshes } =
    setUpEdgeResources<number>();

  const highlight = createSlotHighlight();

  // covers one shred row; shared material so it isn't dimmed
  const highlightMesh = createRectMesh(resources, SHRED_EVENT_TYPES_COUNT - 1);
  scene.add(highlightMesh.mesh);

  renderer.render(scene, camera);

  const cleanUp = () => {
    if (!getWasContextLost()) {
      highlightMesh.mesh.geometry.dispose();
      disposeSlotMaterials({
        meshes,
        availableMeshes,
        edgeMeshes,
        availableEdgeMeshes,
      });
    }
    cleanUpResources();
    cleanUpEdgeResources(
      { edgeResources, edgeMeshes, availableEdgeMeshes },
      getWasContextLost(),
    );
    cleanUpRendererContext();
  };

  return {
    renderer,
    camera,
    scene,
    meshes,
    availableMeshes,
    resources,
    highlight,
    highlightMesh,
    edgeResources,
    edgeMeshes,
    availableEdgeMeshes,
    cleanUp,
  };
}
