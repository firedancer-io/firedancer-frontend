import { setUpRendererResources } from "../../Shreds/WebGl/setupUtils";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import {
  createRectMesh,
  createRenderer,
  type TsRange,
} from "../../WebGl/webglUtils";
import { type RendererObj } from "./const";
import { AGG_SLOT_SHRED_THRESHOLD_MS } from "../const";
import { omit } from "lodash";
import { setUpAggResources } from "./aggUtils";
import {
  setUpEdgeResources,
  cleanUpEdgeResources,
} from "../../Shreds/WebGl/edgeUtils";
import { SHRED_EVENT_TYPES_COUNT } from "../../../api/entities";
import { disposeSlotMaterials } from "../../Shreds/WebGl/drawUtils";
import { createSlotHighlight } from "../slotHighlight";

export function setUpRenderers(
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const rendererObj = createRenderer(setUpContextListeners, getWasContextLost);
  if (!rendererObj) return;

  const { renderer, cleanUpRenderer } = rendererObj;

  const baseNonAggResources = setUpRendererResources<string>(getWasContextLost);

  const highlightMesh = createRectMesh(
    baseNonAggResources.resources,
    SHRED_EVENT_TYPES_COUNT - 1,
  );
  baseNonAggResources.scene.add(highlightMesh.mesh);

  // Edge mark resources are replay-only
  const edgeResourceBundle = setUpEdgeResources<string>();

  const nonAggResources = {
    ...baseNonAggResources,
    highlightMesh,
    cameraReferenceMs: 0,
    ...edgeResourceBundle,
    highlight: createSlotHighlight(),
    staleMeshKeys: new Set<string>(),
  };
  const aggResources = setUpAggResources(getWasContextLost);

  const cleanUp = () => {
    aggResources.cleanUpResources();
    if (!getWasContextLost()) {
      highlightMesh.mesh.geometry.dispose();
      disposeSlotMaterials(nonAggResources);
    }
    nonAggResources.cleanUpResources();
    cleanUpEdgeResources(edgeResourceBundle, getWasContextLost());
    cleanUpRenderer();
  };

  return {
    renderer,
    nonAggResources: omit(nonAggResources, "cleanUpResources"),
    aggResources: omit(aggResources, "cleanUpResources"),
    cleanUp,
  };
}

export function isAggregate(rangeMs: TsRange) {
  return rangeMs[1] - rangeMs[0] > AGG_SLOT_SHRED_THRESHOLD_MS;
}
