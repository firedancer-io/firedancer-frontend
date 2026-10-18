import { setUpRendererResources } from "../../Shreds/WebGl/setupUtils";
import { MAX_WEBGL_PX_RATIO } from "../../../consts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import { createRenderer, type TsRange } from "../../WebGl/webglUtils";
import { SHREDS_AGG_THRESHOLD_MS, type RendererObj } from "./const";
import { omit } from "lodash";
import { setUpAggResources } from "./aggUtils";

export function setUpRenderers(
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const rendererObj = createRenderer(
    canvasWidth,
    canvasHeight,
    MAX_WEBGL_PX_RATIO,
    setUpContextListeners,
    getWasContextLost,
  );
  if (!rendererObj) return;

  const { renderer, cleanUpRenderer } = rendererObj;
  const nonAggResources = {
    ...setUpRendererResources<string>(getWasContextLost),
    cameraReferenceMs: 0,
  };
  const aggResources = setUpAggResources(getWasContextLost);

  const cleanUp = () => {
    aggResources.cleanUpResources();
    nonAggResources.cleanUpResources();
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
  return rangeMs[1] - rangeMs[0] > SHREDS_AGG_THRESHOLD_MS;
}
