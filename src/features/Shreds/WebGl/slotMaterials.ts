import type { RectResources } from "../../WebGl/webglUtils";
import { createRectMaterial } from "../../WebGl/webglUtils";
import {
  getSlotUniforms,
  slotFragmentShader,
  type SlotHighlight,
} from "../../Replay/slotHighlight";
import { createEdgeMaterial } from "./edgeUtils";
import { SHREDS_OPACITY } from "./const";

// each slot mesh owns its material, for a per-mesh uSlot
export function createSlotMaterial(highlight: SlotHighlight) {
  return createRectMaterial(
    SHREDS_OPACITY,
    slotFragmentShader,
    getSlotUniforms(highlight),
  );
}

// shares the edge resources' view width and opacity
export function createSlotEdgeMaterial(
  highlight: SlotHighlight,
  edgeResources: RectResources,
) {
  const { uniforms } = edgeResources.rectMaterial;
  return createEdgeMaterial(slotFragmentShader, {
    ...getSlotUniforms(highlight),
    uViewWidthPx: uniforms.uViewWidthPx,
    uOpacity: uniforms.uOpacity,
  });
}
